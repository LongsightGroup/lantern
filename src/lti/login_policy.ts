import { getLtiProfileDefinition, type ResolvedLtiProfile } from './profile.ts';
import { buildLanternTargetLinkUri } from './target_link_uri.ts';
import type { DeploymentRecord } from '../package_review/types.ts';

export interface LoginPolicyRequest {
  readonly request: {
    readonly loginHint: string;
    readonly ltiMessageHint: string | null;
    readonly targetLinkUri: string | null;
  };
  readonly compatibility: {
    readonly decodedLoginHint: string | null;
    readonly decodedLtiMessageHint: string | null;
  };
}

export function resolveLoginPolicy(input: {
  appOrigin: string;
  binding: NonNullable<DeploymentRecord['binding']>;
  loginRequest: LoginPolicyRequest;
  ltiProfile: ResolvedLtiProfile;
}): {
  loginHint: string;
  ltiMessageHint?: string;
  targetLinkUri: string;
  compatibilityPaths: string[];
} {
  const profileBehavior = getLtiProfileDefinition(input.ltiProfile.id).behavior;
  const compatibilityPaths: string[] = [];

  if (
    (input.loginRequest.compatibility.decodedLoginHint !== null ||
      input.loginRequest.compatibility.decodedLtiMessageHint !== null) &&
    !profileBehavior.decodeOpaqueHints
  ) {
    throw new Error('The active LTI profile does not allow opaque login hint decoding.');
  }

  const loginHint = input.loginRequest.compatibility.decodedLoginHint ??
    input.loginRequest.request.loginHint;
  const ltiMessageHint = input.loginRequest.request.ltiMessageHint === null
    ? undefined
    : input.loginRequest.compatibility.decodedLtiMessageHint ??
      input.loginRequest.request.ltiMessageHint;

  if (input.loginRequest.compatibility.decodedLoginHint !== null) {
    compatibilityPaths.push('opaque_login_hint_decode');
  }

  if (input.loginRequest.compatibility.decodedLtiMessageHint !== null) {
    compatibilityPaths.push('opaque_lti_message_hint_decode');
  }

  if (input.loginRequest.request.targetLinkUri !== null) {
    return {
      loginHint,
      ...(ltiMessageHint === undefined ? {} : { ltiMessageHint }),
      targetLinkUri: input.loginRequest.request.targetLinkUri,
      compatibilityPaths,
    };
  }

  if (input.binding.lms === 'canvas') {
    throw new Error(
      'Canvas launches use more than one Lantern callback route; target_link_uri is required.',
    );
  }

  if (!profileBehavior.allowPlatformDefaultLaunchTarget) {
    throw new Error('The active LTI profile requires target_link_uri in login initiation.');
  }

  compatibilityPaths.push('platform_default_launch_target');

  return {
    loginHint,
    ...(ltiMessageHint === undefined ? {} : { ltiMessageHint }),
    targetLinkUri: buildLanternTargetLinkUri('launch', input.appOrigin),
    compatibilityPaths,
  };
}
