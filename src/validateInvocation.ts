import {
  IntegrationExecutionContext,
  IntegrationValidationError,
} from '@jupiterone/integration-sdk-core';

import { createAPIClient } from './client';
import { IntegrationConfig } from './types';

export default async function validateInvocation(
  context: IntegrationExecutionContext<IntegrationConfig>,
) {
  const { config } = context.instance;

  if (!config.apiKey) {
    throw new IntegrationValidationError('Config requires all of {apiKey}');
  }

  const apiClient = createAPIClient(config);
  await apiClient.verifyAuthentication();
}
