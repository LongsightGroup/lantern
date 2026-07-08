import type {
  DynamicRegistrationForm,
  LtiDynamicRegistrationCompletionResult,
  RegistrationRequest,
} from '@longsightgroup/lti-tool';
import { resolveCanvasPlatform } from './canvas_platform.ts';
import { requireAppOrigin } from './config.ts';
import type { DeploymentBinding } from './types.ts';
import type { LanternLtiToolContext } from './tool_provider.ts';

export type DynamicRegistrationLms = 'canvas' | 'moodle' | 'sakai';

export interface LanternDynamicRegistrationAppState {
  appId: string;
  lms: DynamicRegistrationLms;
}

export interface LanternDynamicRegistrationCompletion {
  appState: LanternDynamicRegistrationAppState;
  launchConfig: LtiDynamicRegistrationCompletionResult['launchConfig'];
  canvasEnvironment: 'production' | 'beta' | 'test' | null;
  binding: DeploymentBinding | null;
  usedDefaultDeploymentId: boolean;
}

const DEFAULT_DYNAMIC_REGISTRATION_SERVICES: DynamicRegistrationForm['services'] = [
  'ags',
  'nrps',
  'deep_linking',
];

export function buildDynamicRegistrationUrl(
  appId: string,
  lms: DynamicRegistrationLms,
  state: string | null = null,
  appOrigin = requireAppOrigin(),
): string {
  const url = new URL(
    `${appOrigin}/admin/packages/${encodeURIComponent(appId)}/deployment/register/${lms}`,
  );

  if (state !== null) {
    url.searchParams.set('state', state);
  }

  return url.toString();
}

export async function completeLanternDynamicRegistrationWithLtiTool(input: {
  ltiContext: LanternLtiToolContext;
  appId: string;
  lms: DynamicRegistrationLms;
  requestPath: string;
  openidConfigurationUrl: string;
  registrationToken: string | null;
}): Promise<LanternDynamicRegistrationCompletion> {
  const registrationRequest: RegistrationRequest = {
    openid_configuration: input.openidConfigurationUrl,
    ...(input.registrationToken === null ? {} : { registration_token: input.registrationToken }),
  };
  const initiated = await input.ltiContext.dynamicRegistration.initiateDynamicRegistration(
    registrationRequest,
    input.requestPath,
    {
      appState: {
        appId: input.appId,
        lms: input.lms,
      },
    },
  );

  if (!initiated.success) {
    throw new Error(initiated.error.message);
  }

  const completed = await input.ltiContext.dynamicRegistration.completeDynamicRegistration({
    services: DEFAULT_DYNAMIC_REGISTRATION_SERVICES,
    sessionToken: readRegistrationSessionToken(initiated.data),
  });

  if (!completed.success) {
    throw new Error(completed.error.message);
  }

  const appState = readLanternDynamicRegistrationAppState(completed.data.appState);

  if (appState.appId !== input.appId || appState.lms !== input.lms) {
    throw new Error('lti-tool dynamic registration returned mismatched Lantern app state.');
  }

  const canvasEnvironment = input.lms === 'canvas'
    ? resolveCanvasPlatform(completed.data.launchConfig.iss).environment
    : null;
  const binding = input.lms === 'canvas'
    ? null
    : buildDeploymentBinding(input.lms, completed.data.launchConfig);

  return {
    appState,
    launchConfig: completed.data.launchConfig,
    canvasEnvironment,
    binding,
    usedDefaultDeploymentId: completed.data.launchConfig.deploymentId === 'default',
  };
}

function buildDeploymentBinding(
  lms: Exclude<DynamicRegistrationLms, 'canvas'>,
  launchConfig: LtiDynamicRegistrationCompletionResult['launchConfig'],
): DeploymentBinding {
  return {
    lms,
    issuer: launchConfig.iss,
    clientId: launchConfig.clientId,
    deploymentId: launchConfig.deploymentId,
    authorizationEndpoint: launchConfig.authUrl,
    accessTokenUrl: launchConfig.tokenUrl,
    jwksUrl: launchConfig.jwksUrl,
  };
}

function readRegistrationSessionToken(html: string): string {
  const match = html.match(/\bname=["']sessionToken["'][^>]*\bvalue=["']([^"']+)["']/i) ??
    html.match(/\bvalue=["']([^"']+)["'][^>]*\bname=["']sessionToken["']/i);

  if (match?.[1] === undefined || match[1].trim() === '') {
    throw new Error('lti-tool dynamic registration did not return a registration session token.');
  }

  return match[1];
}

function readLanternDynamicRegistrationAppState(
  value: LtiDynamicRegistrationCompletionResult['appState'],
): LanternDynamicRegistrationAppState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('lti-tool dynamic registration did not return Lantern app state.');
  }

  const record = value as Record<string, unknown>;

  if (typeof record.appId !== 'string' || record.appId.trim() === '') {
    throw new Error('lti-tool dynamic registration app state is missing appId.');
  }

  if (record.lms !== 'canvas' && record.lms !== 'moodle' && record.lms !== 'sakai') {
    throw new Error('lti-tool dynamic registration app state is missing lms.');
  }

  return {
    appId: record.appId,
    lms: record.lms,
  };
}
