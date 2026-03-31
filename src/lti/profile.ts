export const LTI_CERTIFICATION_PROFILE_ID = "certification";
export const LTI_GOVERNED_COMPATIBILITY_PROFILE_ID = "governedCompatibility";

export type LtiProfileId =
  | typeof LTI_CERTIFICATION_PROFILE_ID
  | typeof LTI_GOVERNED_COMPATIBILITY_PROFILE_ID;

export interface LtiProfileDefinition {
  id: LtiProfileId;
  label: string;
  summary: string;
  behavior: {
    decodeOpaqueHints: boolean;
    tolerateTargetLinkUriDrift: boolean;
    allowDeepLinkingJtiNonceBridge: boolean;
    retryJwksRefetchOnce: boolean;
    retryServiceUnauthorizedOnce: boolean;
    allowPlatformDefaultLaunchTarget: boolean;
  };
}

export interface ResolvedLtiProfile {
  id: LtiProfileId;
  source: "lanternDefault" | "deploymentOverride";
  deploymentRecordId: number;
}

export const DEFAULT_LTI_PROFILE_ID = LTI_GOVERNED_COMPATIBILITY_PROFILE_ID;

export const LTI_PROFILE_DEFINITIONS: readonly LtiProfileDefinition[] = [
  {
    id: LTI_CERTIFICATION_PROFILE_ID,
    label: "Certification",
    summary: "Use strict LTI behavior for diagnostics and certification runs.",
    behavior: {
      decodeOpaqueHints: false,
      tolerateTargetLinkUriDrift: false,
      allowDeepLinkingJtiNonceBridge: false,
      retryJwksRefetchOnce: false,
      retryServiceUnauthorizedOnce: false,
      allowPlatformDefaultLaunchTarget: false,
    },
  },
  {
    id: LTI_GOVERNED_COMPATIBILITY_PROFILE_ID,
    label: "Governed interoperability",
    summary:
      "Keep Lantern's bounded real-world LTI compatibility paths available.",
    behavior: {
      decodeOpaqueHints: true,
      tolerateTargetLinkUriDrift: true,
      allowDeepLinkingJtiNonceBridge: true,
      retryJwksRefetchOnce: true,
      retryServiceUnauthorizedOnce: true,
      allowPlatformDefaultLaunchTarget: true,
    },
  },
] as const;

export function isLtiProfileId(value: string): value is LtiProfileId {
  return LTI_PROFILE_DEFINITIONS.some((profile) => profile.id === value);
}

export function requireLtiProfileId(
  value: string,
  message = "Choose one supported LTI profile.",
): LtiProfileId {
  if (isLtiProfileId(value)) {
    return value;
  }

  throw new Error(message);
}

export function getLtiProfileDefinition(
  profileId: LtiProfileId,
): LtiProfileDefinition {
  const profile = LTI_PROFILE_DEFINITIONS.find((candidate) =>
    candidate.id === profileId
  );

  if (!profile) {
    throw new Error(`Unsupported LTI profile ${profileId}.`);
  }

  return profile;
}
