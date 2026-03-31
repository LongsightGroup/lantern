import type { PackageReviewRepository } from "../package_review/repository.ts";
import type { DeploymentRecord } from "../package_review/types.ts";
import type { LtiProfileId, ResolvedLtiProfile } from "./profile.ts";
import { getLtiProfileDefinition } from "./profile.ts";

export async function resolveLtiProfileForDeployment(input: {
  repository: Pick<PackageReviewRepository, "getLanternLtiProfileSettings">;
  deployment: Pick<DeploymentRecord, "id" | "ltiProfileOverride">;
}): Promise<ResolvedLtiProfile> {
  const settings = await input.repository.getLanternLtiProfileSettings();
  const source = input.deployment.ltiProfileOverride === null
    ? "lanternDefault"
    : "deploymentOverride";

  return {
    id: input.deployment.ltiProfileOverride ?? settings.defaultLtiProfile,
    source,
    deploymentRecordId: input.deployment.id,
  };
}

export function buildResolvedLtiProfileDetail(
  profile: ResolvedLtiProfile,
): {
  ltiProfileId: LtiProfileId;
  ltiProfileSource: ResolvedLtiProfile["source"];
} {
  return {
    ltiProfileId: profile.id,
    ltiProfileSource: profile.source,
  };
}

export function describeResolvedLtiProfile(profile: {
  id: LtiProfileId;
  source: ResolvedLtiProfile["source"];
}): string {
  const label = getLtiProfileDefinition(profile.id).label;

  return profile.source === "deploymentOverride"
    ? `${label} override`
    : `${label} from Lantern default`;
}
