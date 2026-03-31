import type { PackageReviewRepository } from "../package_review/repository.ts";
import { DEFAULT_UPDATED_AT } from "./package_review_test_defaults.ts";
import {
  completePendingCanvasBinding,
  saveCanvasRegistration,
} from "./package_review_in_memory_canvas_registrations.ts";
import type { InMemoryRepositoryState } from "./package_review_in_memory_shared.ts";
import { cloneRecord, nextId } from "./package_review_in_memory_shared.ts";
import { buildDeploymentRecord } from "./package_review_test_builder_base.ts";

type DeploymentRepository = Pick<
  PackageReviewRepository,
  | "getDeploymentBySlug"
  | "getLanternLtiProfileSettings"
  | "listDeploymentsByApp"
  | "getDeploymentByBinding"
  | "getDeploymentByPlatformIdentity"
  | "completePendingCanvasBinding"
  | "saveLanternDefaultLtiProfile"
  | "saveDeploymentLtiProfileOverride"
  | "saveDeploymentBinding"
  | "saveCanvasRegistration"
  | "pinDeploymentVersion"
>;

export function createInMemoryDeploymentRepository(
  state: InMemoryRepositoryState,
): DeploymentRepository {
  return {
    getDeploymentBySlug(slug) {
      const deployment = state.deployments.find((candidate) =>
        candidate.slug === slug
      );
      return Promise.resolve(deployment ? cloneRecord(deployment) : null);
    },

    getLanternLtiProfileSettings() {
      return Promise.resolve(cloneRecord(state.lanternLtiProfileSettings));
    },

    listDeploymentsByApp(appId) {
      return Promise.resolve(
        state.deployments
          .filter((candidate) =>
            candidate.appId === appId && candidate.lmsType !== "preview"
          )
          .map((deployment) => cloneRecord(deployment)),
      );
    },

    getDeploymentByBinding(binding) {
      const deployment = state.deployments.find(
        (candidate) =>
          candidate.binding?.lms === binding.lms &&
          candidate.binding?.issuer === binding.issuer &&
          candidate.binding?.clientId === binding.clientId &&
          candidate.binding?.deploymentId === binding.deploymentId,
      );
      return Promise.resolve(deployment ? cloneRecord(deployment) : null);
    },

    getDeploymentByPlatformIdentity(input) {
      const deployments = state.deployments.filter(
        (candidate) =>
          candidate.binding?.issuer === input.issuer &&
          candidate.binding?.deploymentId === input.deploymentId,
      );

      const matchingDeployments = input.clientId === null
        ? deployments
        : deployments.filter((candidate) =>
          candidate.binding?.clientId === input.clientId
        );

      if (matchingDeployments.length === 0) {
        if (input.clientId !== null) {
          const canvasMatches = state.deployments.filter((candidate) =>
            candidate.binding?.lms === "canvas" &&
            candidate.binding.issuer === input.issuer &&
            candidate.binding.clientId === input.clientId
          );
          const savedCanvas = canvasMatches[0];

          if (
            canvasMatches.length === 1 &&
            savedCanvas?.binding?.deploymentId !== undefined &&
            savedCanvas.binding.deploymentId !== input.deploymentId
          ) {
            throw new Error(
              `Canvas sent deployment ${input.deploymentId} for issuer ${input.issuer} and client ${input.clientId}, but Lantern saved deployment ${savedCanvas.binding.deploymentId}. Update the saved Canvas binding or relaunch from the correct Canvas placement.`,
            );
          }
        }

        return Promise.resolve(null);
      }

      if (matchingDeployments.length > 1) {
        if (input.clientId === null) {
          throw new Error(
            `Multiple deployments matched issuer ${input.issuer} with deployment ${input.deploymentId}. Platform must send client_id or duplicate LMS bindings must be resolved before login can continue.`,
          );
        }

        throw new Error(
          `Multiple deployments matched issuer ${input.issuer} with client ${input.clientId} and deployment ${input.deploymentId}. Resolve the duplicate LMS bindings before login can continue.`,
        );
      }

      const deployment = matchingDeployments[0];

      if (!deployment) {
        return Promise.resolve(null);
      }

      return Promise.resolve(cloneRecord(deployment));
    },

    completePendingCanvasBinding(input) {
      return Promise.resolve(completePendingCanvasBinding(state, input));
    },

    saveLanternDefaultLtiProfile(input) {
      const nextRecord = cloneRecord({
        defaultLtiProfile: input.defaultLtiProfile,
        updatedAt: DEFAULT_UPDATED_AT,
      });
      state.lanternLtiProfileSettings = nextRecord;
      return Promise.resolve(cloneRecord(nextRecord));
    },

    saveDeploymentLtiProfileOverride(input) {
      const index = state.deployments.findIndex((candidate) =>
        candidate.id === input.deploymentId
      );

      if (index < 0) {
        throw new Error(`Deployment id ${input.deploymentId} was not found.`);
      }

      const existing = state.deployments[index];

      if (!existing) {
        throw new Error(`Deployment id ${input.deploymentId} was not found.`);
      }

      const nextDeployment = buildDeploymentRecord({
        ...existing,
        ltiProfileOverride: input.ltiProfileOverride,
        updatedAt: DEFAULT_UPDATED_AT,
      });
      state.deployments.splice(index, 1, nextDeployment);
      return Promise.resolve(cloneRecord(nextDeployment));
    },

    saveDeploymentBinding(input) {
      const existing = state.deployments.find((candidate) =>
        candidate.slug === input.slug
      );
      const existingAppSlot = state.deployments.find(
        (candidate) =>
          candidate.slug !== input.slug &&
          candidate.appId === input.appId &&
          candidate.binding?.lms === input.binding.lms,
      );
      const conflicting = state.deployments.find(
        (candidate) =>
          candidate.slug !== input.slug &&
          candidate.binding?.lms === input.binding.lms &&
          candidate.binding?.issuer === input.binding.issuer &&
          candidate.binding?.clientId === input.binding.clientId &&
          candidate.binding?.deploymentId === input.binding.deploymentId,
      );

      if (conflicting) {
        throw new Error(
          `${
            formatBindingLabel(
              input.binding.lms,
            )
          } ${input.binding.clientId} / ${input.binding.deploymentId} already belongs to another deployment.`,
        );
      }

      if (existing && existing.appId !== input.appId) {
        throw new Error(
          `Deployment ${input.slug} belongs to app ${existing.appId}.`,
        );
      }

      if (
        existing && existing.binding !== null &&
        existing.binding.lms !== input.binding.lms
      ) {
        throw new Error(
          `Deployment ${input.slug} is already bound as ${existing.binding.lms} and cannot change to ${input.binding.lms}.`,
        );
      }

      if (existingAppSlot) {
        throw new Error(
          `App ${input.appId} already has a ${input.binding.lms} deployment.`,
        );
      }

      const nextDeployment = buildDeploymentRecord({
        id: existing?.id ?? nextId(state.deployments),
        slug: input.slug,
        label: input.label,
        appId: input.appId,
        enabledPackageVersionId: existing?.enabledPackageVersionId ?? null,
        enabledPackageVersion: existing?.enabledPackageVersion ?? null,
        binding: cloneRecord(input.binding),
        ltiProfileOverride: existing?.ltiProfileOverride ?? null,
        updatedAt: DEFAULT_UPDATED_AT,
      });

      if (existing) {
        const index = state.deployments.findIndex((candidate) =>
          candidate.slug === input.slug
        );
        state.deployments.splice(index, 1, nextDeployment);
      } else {
        state.deployments.push(nextDeployment);
      }

      return Promise.resolve(cloneRecord(nextDeployment));
    },

    saveCanvasRegistration(input) {
      return Promise.resolve(saveCanvasRegistration(state, input));
    },

    pinDeploymentVersion(input) {
      const lmsType = input.lmsType ?? "canvas";
      const packageVersion = state.packageVersions.find(
        (candidate) => candidate.id === input.packageVersionId,
      );

      if (!packageVersion) {
        throw new Error(
          `Package version id ${input.packageVersionId} was not found.`,
        );
      }

      if (packageVersion.approvalStatus !== "approved") {
        throw new Error("Only approved package versions can be enabled.");
      }

      if (packageVersion.appId !== input.appId) {
        throw new Error(
          `Package version ${packageVersion.appId}@${packageVersion.version} does not belong to deployment app ${input.appId}.`,
        );
      }

      const existing = state.deployments.find((candidate) =>
        candidate.slug === input.slug
      );

      if (existing && existing.appId !== input.appId) {
        throw new Error(
          `Deployment ${input.slug} belongs to app ${existing.appId}.`,
        );
      }

      if (existing && existing.lmsType !== lmsType) {
        throw new Error(
          `Deployment ${input.slug} is already reserved as ${existing.lmsType} and cannot change to ${lmsType}.`,
        );
      }

      const nextDeployment = buildDeploymentRecord({
        id: existing?.id ?? nextId(state.deployments),
        slug: input.slug,
        label: input.label,
        appId: input.appId,
        enabledPackageVersionId: packageVersion.id,
        enabledPackageVersion: packageVersion.version,
        lmsType,
        binding: existing?.binding ?? null,
        ltiProfileOverride: existing?.ltiProfileOverride ?? null,
        updatedAt: DEFAULT_UPDATED_AT,
      });

      if (existing) {
        const index = state.deployments.findIndex((candidate) =>
          candidate.slug === input.slug
        );
        state.deployments.splice(index, 1, nextDeployment);
      } else {
        state.deployments.push(nextDeployment);
      }

      return Promise.resolve(cloneRecord(nextDeployment));
    },
  };
}

function formatBindingLabel(lms: "canvas" | "moodle" | "sakai"): string {
  return `${lms.slice(0, 1).toUpperCase()}${lms.slice(1)} binding`;
}
