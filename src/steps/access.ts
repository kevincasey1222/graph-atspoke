import {
  createDirectRelationship,
  createIntegrationEntity,
  Entity,
  IntegrationStep,
  IntegrationStepExecutionContext,
  RelationshipClass,
  IntegrationMissingKeyError,
} from '@jupiterone/integration-sdk-core';

import { createAPIClient } from '../client';
import { IntegrationConfig } from '../types';
import { DATA_ACCOUNT_ENTITY } from './account';
import { AtSpokeUser } from '../client';

export async function fetchUsers({
  instance,
  jobState,
}: IntegrationStepExecutionContext<IntegrationConfig>) {
  const apiClient = createAPIClient(instance.config);

  const accountEntity = (await jobState.getData(DATA_ACCOUNT_ENTITY)) as Entity;

  await apiClient.iterateUsers(async (user) => {
    //real names are optional for atSpoke users
    let graphName;
    if (user.displayName) {
      graphName = user.displayName;
    } else {
      graphName = user.email;
    }

    //a weblink is not included in the API user object, but it exists and is derivable
    //it is https://<accountEntity.org>.askspoke.com/users/user.id
    const permalink = `https://${accountEntity.org}.askspoke.com/users/${user.id}`;

    const userEntity = await jobState.addEntity(
      createIntegrationEntity({
        entityData: {
          source: user,
          assign: {
            _type: 'atspoke_user',
            _class: 'User',
            _key: user.id,
            username: graphName,
            name: graphName,
            displayName: graphName,
            webLink: permalink,
            email: user.email,
            isEmailVerified: user.isEmailVerified,
            isProfileCompleted: user.isProfileCompleted,
            status: user.status,
          },
        },
      }),
    );

    await jobState.addRelationship(
      createDirectRelationship({
        _class: RelationshipClass.HAS,
        from: accountEntity,
        to: userEntity,
      }),
    );
  });
}

export async function fetchTeams({
  instance,
  jobState,
}: IntegrationStepExecutionContext<IntegrationConfig>) {
  const apiClient = createAPIClient(instance.config);

  const accountEntity = (await jobState.getData(DATA_ACCOUNT_ENTITY)) as Entity;

  await apiClient.iterateTeams(async (team) => {
    const users: AtSpokeUser[] = [];
    if (team.agentList) {
      for (const agent of team.agentList) {
        users.push(agent.user);
      }
      delete team.agentList;
    }
    const groupEntity = await jobState.addEntity(
      createIntegrationEntity({
        entityData: {
          source: team,
          assign: {
            _type: 'atspoke_team',
            _class: 'UserGroup',
            _key: team.id,
            email: team.email,
            name: team.name,
            displayName: team.name,
            description: team.description,
            org: team.org,
            webLink: team.permalink,
          },
        },
      }),
    );

    await jobState.addRelationship(
      createDirectRelationship({
        _class: RelationshipClass.HAS,
        from: accountEntity,
        to: groupEntity,
      }),
    );

    for (const user of users || []) {
      const userEntity = await jobState.findEntity(user.id);

      if (!userEntity) {
        throw new IntegrationMissingKeyError(
          `Expected user with key to exist (key=${user.id})`,
        );
      }

      await jobState.addRelationship(
        createDirectRelationship({
          _class: RelationshipClass.HAS,
          from: groupEntity,
          to: userEntity,
        }),
      );
    }
  });
}

export const accessSteps: IntegrationStep<IntegrationConfig>[] = [
  {
    id: 'fetch-users',
    name: 'Fetch Users',
    entities: [
      {
        resourceName: 'atSpoke User',
        _type: 'atspoke_user',
        _class: 'User',
      },
    ],
    relationships: [
      {
        _type: 'atspoke_account_has_user',
        _class: RelationshipClass.HAS,
        sourceType: 'atspoke_account',
        targetType: 'atspoke_user',
      },
    ],
    dependsOn: ['fetch-account'],
    executionHandler: fetchUsers,
  },
  {
    id: 'fetch-teams',
    name: 'Fetch Teams',
    entities: [
      {
        resourceName: 'atSpoke Team',
        _type: 'atspoke_team',
        _class: 'UserGroup',
      },
    ],
    relationships: [
      {
        _type: 'atspoke_account_has_team',
        _class: RelationshipClass.HAS,
        sourceType: 'atspoke_account',
        targetType: 'atspoke_team',
      },
      {
        _type: 'atspoke_team_has_user',
        _class: RelationshipClass.HAS,
        sourceType: 'atspoke_team',
        targetType: 'atspoke_user',
      },
    ],
    dependsOn: ['fetch-users'],
    executionHandler: fetchTeams,
  },
];
