import axios, { AxiosInstance } from 'axios';

import { IntegrationProviderAuthenticationError } from '@jupiterone/integration-sdk-core';

import { IntegrationConfig } from './types';

export type ResourceIteratee<T> = (each: T) => Promise<void> | void;

type AtSpokeUser = {
  id: string;
  displayName: string;
  email: string;
  isEmailVerified?: boolean;
  isProfileCompleted?: boolean;
  status?: string;
  profile?: object;
  memberships?: string[];
  startDate?: string;
};

type AtSpokeGroup = {
  id: string;
  name: string;
  slug: string;
  description: string;
  keywords: string[];
  icon: string;
  color: string;
  status: string;
  goals: object;
  agentList: AtSpokeAgentListItem[];
  createdAt: string;
  updatedAt: string;
  owner: string;
  org: string;
  email: string;
  permalink: string;
  settings?: object;
  users?: Pick<AtSpokeUser, 'id'>[];
};

type AtSpokeAgentListItem = {
  timestamps?: object;
  status: string;
  teamRole: string;
  user: AtSpokeUser;
};

type AtSpokeWebhook = {
  enabled: boolean;
  topics: string[];
  url: string;
  client: string;
  description: string;
  id: string;
};

type AtSpokeRequest = {
  subject: string;
  requester: string;
  owner: string;
  status: string;
  privacyLevel: string;
  team: string;
  org: string;
  permalink: string;
  id: string;
  requestType?: string;
  isAutoResolve: boolean;
  isFiled: boolean;
  email: string;
};

type AtSpokeRequestType = {
  id: string;
  status: string;
  icon: string;
  title: string;
  description: string;
};

/**
 * An APIClient maintains authentication state and provides an interface to
 * third party data APIs.
 *
 * It is recommended that integrations wrap provider data APIs to provide a
 * place to handle error responses and implement common patterns for iterating
 * resources.
 */
export class APIClient {
  constructor(readonly config: IntegrationConfig) {}

  getClient(): AxiosInstance {
    const client = axios.create({
      headers: {
        get: {
          client: 'JupiterOne-atSpoke Integration client',
          'Content-Type': 'application/json',
          'Api-Key': this.config.apiKey,
        },
      },
    });
    return client;
  }

  public async verifyAuthentication(): Promise<void> {
    // the most light-weight request possible to validate
    // authentication works with the provided credentials, throw an err if
    // authentication fails
    return await this.contactAPI('https://api.askspoke.com/api/v1/whoami');
  }

  public async getAccountInfo() {
    return await this.contactAPI('https://api.askspoke.com/api/v1/whoami');
  }

  /**
   * Iterates each atSpoke user.
   *
   * @param iteratee receives each resource to produce entities/relationships
   */
  public async iterateUsers(
    iteratee: ResourceIteratee<AtSpokeUser>,
  ): Promise<void> {
    const pageSize = 25; //do not increase, b/c it will break when ai=true for atSpoke
    var recordsPulled = 0;
    var lastRecord = 0;
    while (lastRecord == 0) {
      const paramsToPass = {
        params: {
          start: recordsPulled, //starting index. 0 is most recent.
          limit: pageSize,
        },
      };
      const reply = await this.contactAPI(
        'https://api.askspoke.com/api/v1/users', 
        paramsToPass,
      );

      const users: AtSpokeUser[] = reply.results;

      for (const user of users) {
        await iteratee(user);
      }

      if (users.length < pageSize) { lastRecord = 1; }
      recordsPulled = recordsPulled + pageSize;
    }
  }

  /**
   * Iterates each atSpoke team.
   *
   * @param iteratee receives each resource to produce entities/relationships
   */
  public async iterateGroups(
    iteratee: ResourceIteratee<AtSpokeGroup>,
  ): Promise<void> {
    const pageSize = 25; //do not increase, b/c it will break when ai=true for atSpoke
    var recordsPulled = 0;
    var lastRecord = 0;
    while (lastRecord == 0) {
      const paramsToPass = {
        params: {
          start: recordsPulled, //starting index. 0 is most recent.
          limit: pageSize,
        },
      };
      const reply = await this.contactAPI(
        'https://api.askspoke.com/api/v1/teams',
        paramsToPass,
      );

      const groups: AtSpokeGroup[] = reply.results;

      for (const group of groups) {
        if (group.users === undefined) {
          group.users = [];
        }
        for (const agent of group.agentList) {
          group.users.push(agent.user);
        }
        await iteratee(group);
      }

      if (groups.length < pageSize) { lastRecord = 1; }
      recordsPulled = recordsPulled + pageSize;
    }
  }

  /**
   * Iterates each atSpoke webhook.
   *
   * @param iteratee receives each resource to produce entities/relationships
   */
  public async iterateWebhooks(
    iteratee: ResourceIteratee<AtSpokeWebhook>,
  ): Promise<void> {
    const reply = await this.contactAPI(
      'https://api.askspoke.com/api/v1/webhooks',
    );

    const webhooks: AtSpokeWebhook[] = reply.results;

    for (const webhook of webhooks) {
      await iteratee(webhook);
    }
  }

  /**
   * Iterates each atSpoke request.
   *
   * @param iteratee receives each resource to produce entities/relationships
   */
  public async iterateRequests(
    iteratee: ResourceIteratee<AtSpokeRequest>,
  ): Promise<void> {
    if (parseInt(this.config.numRequests) > 0) {
      const recordsLimit = parseInt(this.config.numRequests);
      const pageSize = 100; //the max of the atSpoke v1 API
      var recordsPulled = 0;
      var lastRecord = 0;
      while ((recordsPulled < recordsLimit) && (lastRecord == 0)) {
        const paramsToPass = {
          params: {
            start: recordsPulled, //starting index of requests. 0 is most recent.
            limit: pageSize,
            status: 'OPEN,RESOLVED', //pulls only OPEN by default
          },
        };
  
        const reply = await this.contactAPI(
          'https://api.askspoke.com/api/v1/requests',
          paramsToPass,
        );
  
        const requests: AtSpokeRequest[] = reply.results;
  
        for (const request of requests) {
          await iteratee(request);
        }
        if (requests.length < pageSize) { lastRecord = 1; }
        recordsPulled = recordsPulled + pageSize;
      }
    }
  }

  /**
   * Iterates each atSpoke request type.
   *
   * @param iteratee receives each resource to produce entities/relationships
   */
  public async iterateRequestTypes(
    iteratee: ResourceIteratee<AtSpokeRequestType>,
  ): Promise<void> {

    if (parseInt(this.config.numRequests) > 0) {
      const pageSize = 25; 
      var recordsPulled = 0;
      var lastRecord = 0;
      while (lastRecord == 0) {
        const paramsToPass = {
          params: {
            start: recordsPulled, //starting index. 0 is most recent.
            limit: pageSize,
          },
        };
        const reply = await this.contactAPI(
          'https://api.askspoke.com/api/v1/request_types',
          paramsToPass,
        );

        const requestTypes: AtSpokeRequestType[] = reply.results;

        for (const requestType of requestTypes) {
          await iteratee(requestType);
        }
        if (requestTypes.length < pageSize) { lastRecord = 1; }
        recordsPulled = recordsPulled + pageSize;
      }
    }
  }

  public async contactAPI(url, params?) {
    let reply;
    try {
      reply = await this.getClient().get(url, params);
      if (reply.status != 200) {
        throw new IntegrationProviderAuthenticationError({
          endpoint: url,
          status: reply.status,
          statusText: `Received HTTP status ${reply.status}`,
        });
      }
      return reply.data;
    } catch (err) {
      throw new IntegrationProviderAuthenticationError({
        cause: err,
        endpoint: url,
        status: err.status,
        statusText: err.statusText,
      });
    }
  }
}

export function createAPIClient(config: IntegrationConfig): APIClient {
  return new APIClient(config);
}
