import type { DeploymentBinding } from "../lti/types.ts";
import type {
  ApprovalStatus,
  GradePublicationStatus,
} from "../package_review/types.ts";
import type {
  BrokerVerificationRunStatus,
  ControlPlaneActivityStatus,
  ControlPlaneDeploymentHealth,
  ControlPlaneHealthDimension,
} from "./types.ts";

export function buildReviewDimension(
  approvalStatus: ApprovalStatus | null,
  reviewedAt: string | null | undefined,
): ControlPlaneHealthDimension {
  if (approvalStatus === "approved") {
    return {
      name: "review",
      status: "healthy",
      summary: "Reviewed version is approved.",
      checkedAt: reviewedAt ?? null,
    };
  }

  if (approvalStatus === "rejected") {
    return {
      name: "review",
      status: "failed",
      summary: "Pinned version is rejected and cannot be launched.",
      checkedAt: reviewedAt ?? null,
    };
  }

  if (approvalStatus === "pending") {
    return {
      name: "review",
      status: "attention",
      summary: "Pinned version is still awaiting approval.",
      checkedAt: reviewedAt ?? null,
    };
  }

  return {
    name: "review",
    status: "unknown",
    summary: "No reviewed version is pinned yet.",
    checkedAt: reviewedAt ?? null,
  };
}

export function buildEnablementDimension(
  enabledPackageVersionId: number | null,
  binding: DeploymentBinding | null,
): ControlPlaneHealthDimension {
  if (enabledPackageVersionId !== null && binding !== null) {
    return {
      name: "enablement",
      status: "healthy",
      summary: `Deployment pin and ${describeBinding(binding)} are present.`,
      checkedAt: null,
    };
  }

  if (enabledPackageVersionId !== null) {
    return {
      name: "enablement",
      status: "attention",
      summary:
        "Exact version is pinned, but the deployment binding is still missing.",
      checkedAt: null,
    };
  }

  if (binding !== null) {
    return {
      name: "enablement",
      status: "attention",
      summary: `${
        describeBinding(binding)
      } is saved, but no exact reviewed version is pinned.`,
      checkedAt: null,
    };
  }

  return {
    name: "enablement",
    status: "unknown",
    summary:
      "Deployment still needs an exact version pin and deployment binding.",
    checkedAt: null,
  };
}

export function buildActivityDimension(input: {
  name: "launch" | "nrps";
  status: ControlPlaneActivityStatus | null;
  checkedAt: string | null;
  notRunSummary: string;
  healthySummary: string;
  failedSummary: string;
  pendingSummary: string;
}): ControlPlaneHealthDimension {
  switch (input.status) {
    case "succeeded":
      return {
        name: input.name,
        status: "healthy",
        summary: input.healthySummary,
        checkedAt: input.checkedAt,
      };
    case "failed":
      return {
        name: input.name,
        status: "failed",
        summary: input.failedSummary,
        checkedAt: input.checkedAt,
      };
    case "pending":
      return {
        name: input.name,
        status: "attention",
        summary: input.pendingSummary,
        checkedAt: input.checkedAt,
      };
    case "notRun":
    case null:
      return {
        name: input.name,
        status: "unknown",
        summary: input.notRunSummary,
        checkedAt: input.checkedAt,
      };
  }
}

export function buildGradePublicationDimension(
  status: GradePublicationStatus | null,
  checkedAt: string | null,
): ControlPlaneHealthDimension {
  switch (status) {
    case "published":
      return {
        name: "gradePublication",
        status: "healthy",
        summary: "Latest grade publish succeeded.",
        checkedAt,
      };
    case "failed":
      return {
        name: "gradePublication",
        status: "failed",
        summary: "Latest grade publish failed and may need retry.",
        checkedAt,
      };
    case "pending":
      return {
        name: "gradePublication",
        status: "attention",
        summary: "Latest grade publish is still pending.",
        checkedAt,
      };
    case null:
      return {
        name: "gradePublication",
        status: "unknown",
        summary: "No grade publish has been recorded yet.",
        checkedAt,
      };
  }
}

export function buildBrokerVerificationDimension(
  status: BrokerVerificationRunStatus | null,
  checkedAt: string | null,
): ControlPlaneHealthDimension {
  switch (status) {
    case "passed":
      return {
        name: "brokerVerification",
        status: "healthy",
        summary: "Latest deployment-scoped broker verification passed.",
        checkedAt,
      };
    case "failed":
      return {
        name: "brokerVerification",
        status: "failed",
        summary: "Latest deployment-scoped broker verification failed.",
        checkedAt,
      };
    case "pending":
      return {
        name: "brokerVerification",
        status: "attention",
        summary: "Deployment-scoped broker verification is still pending.",
        checkedAt,
      };
    case "notRun":
    case null:
      return {
        name: "brokerVerification",
        status: "unknown",
        summary:
          "No deployment-scoped broker verification evidence has been recorded yet.",
        checkedAt,
      };
  }
}

export function summarizeOverallHealth(
  overallStatus: ControlPlaneDeploymentHealth["overallStatus"],
  dimensions: ControlPlaneDeploymentHealth["dimensions"],
): string {
  if (overallStatus === "healthy") {
    return "Deployment is healthy across review, launch, grading, and verification.";
  }

  if (overallStatus === "failed") {
    return dimensions.review.status === "failed"
      ? "Deployment is blocked by review state."
      : "Deployment has a failing control-plane signal that needs operator action.";
  }

  if (overallStatus === "attention") {
    if (dimensions.gradePublication.status === "failed") {
      return "Deployment is readable in the control plane and needs a retry or grading follow-up.";
    }

    return "Deployment is readable in the control plane and needs one operator follow-up.";
  }

  return "Deployment does not have enough evidence yet to determine health.";
}

function describeBinding(binding: DeploymentBinding): string {
  switch (binding.lms) {
    case "canvas":
      return "Canvas binding";
    case "moodle":
      return "Moodle binding";
    case "sakai":
      return "Sakai binding";
  }
}
