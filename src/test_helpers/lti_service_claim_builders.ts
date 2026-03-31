import type {
  LaunchAssignmentAndGradeServices,
  LaunchNamesAndRolesService,
  LaunchServiceClaims,
  LmsType,
} from "../lti/types.ts";
import {
  LTI_AGS_LINEITEM_SCOPE as DEFAULT_AGS_LINEITEM_SCOPE,
  LTI_AGS_SCORE_SCOPE as DEFAULT_AGS_SCORE_SCOPE,
} from "../lti/types.ts";

export type AgsShape = "lineitem" | "lineitems" | "both" | "none";

interface TestAgsLaunchServiceDefaults {
  lineitemsUrl: string;
  lineitemUrl: string;
}

const TEST_AGS_SERVICE_DEFAULTS: Record<LmsType, TestAgsLaunchServiceDefaults> =
  {
    canvas: {
      lineitemsUrl: "https://canvas.example/api/lti/courses/42/line_items",
      lineitemUrl: "https://canvas.example/api/lti/courses/42/line_items/9",
    },
    moodle: {
      lineitemsUrl: "https://moodle.example/mod/lti/services.php/2/lineitems",
      lineitemUrl: "https://moodle.example/mod/lti/services.php/2/lineitems/9",
    },
    sakai: {
      lineitemsUrl:
        "https://sakai.example/direct/lti/lineitems/course-42/items",
      lineitemUrl:
        "https://sakai.example/direct/lti/lineitems/course-42/items/9",
    },
  };

const TEST_NRPS_SERVICE_DEFAULTS: Record<LmsType, string> = {
  canvas: "https://canvas.example/api/lti/courses/42/names_and_roles",
  moodle: "https://moodle.example/mod/lti/services.php/2/memberships",
  sakai: "https://sakai.example/direct/lti/memberships/course-42",
};

export interface TestAgsLaunchServiceOverrides
  extends Partial<LaunchAssignmentAndGradeServices> {
  lms?: LmsType;
}

export interface TestNrpsLaunchServiceOverrides
  extends Partial<LaunchNamesAndRolesService> {
  lms?: LmsType;
}

export interface TestLaunchServiceClaimsOverrides {
  lms?: LmsType;
  agsShape?: AgsShape;
  ags?: TestAgsLaunchServiceOverrides | null;
  nrps?: TestNrpsLaunchServiceOverrides | null;
}

export function buildAgsLaunchService(
  overrides: TestAgsLaunchServiceOverrides = {},
  shape: AgsShape = "both",
): LaunchAssignmentAndGradeServices {
  const { lms = "canvas", ...serviceOverrides } = overrides;
  const defaults = TEST_AGS_SERVICE_DEFAULTS[lms];

  return {
    scope: serviceOverrides.scope ??
      [DEFAULT_AGS_SCORE_SCOPE, DEFAULT_AGS_LINEITEM_SCOPE],
    lineitemsUrl: shape === "lineitem" || shape === "none"
      ? null
      : (serviceOverrides.lineitemsUrl ?? defaults.lineitemsUrl),
    lineitemUrl: shape === "lineitems" || shape === "none"
      ? null
      : (serviceOverrides.lineitemUrl ?? defaults.lineitemUrl),
  };
}

export function buildNrpsLaunchService(
  overrides: TestNrpsLaunchServiceOverrides = {},
): LaunchNamesAndRolesService {
  const { lms = "canvas", ...serviceOverrides } = overrides;

  return {
    contextMembershipsUrl: serviceOverrides.contextMembershipsUrl ??
      TEST_NRPS_SERVICE_DEFAULTS[lms],
    serviceVersions: serviceOverrides.serviceVersions ?? ["2.0"],
  };
}

export function buildLaunchServiceClaims(
  overrides: TestLaunchServiceClaimsOverrides = {},
): LaunchServiceClaims {
  const lms = overrides.lms;

  return {
    ags: overrides.ags === null ? null : buildAgsLaunchService(
      {
        ...(lms === undefined ? {} : { lms }),
        ...overrides.ags,
      },
      overrides.agsShape,
    ),
    nrps: overrides.nrps === null ? null : buildNrpsLaunchService({
      ...(lms === undefined ? {} : { lms }),
      ...overrides.nrps,
    }),
  };
}

export function buildAgsLaunchClaimValue(
  overrides: TestAgsLaunchServiceOverrides = {},
  shape: AgsShape = "both",
): Record<string, unknown> {
  const service = buildAgsLaunchService(overrides, shape);

  return {
    scope: service.scope,
    ...(service.lineitemsUrl === null
      ? {}
      : { lineitems: service.lineitemsUrl }),
    ...(service.lineitemUrl === null ? {} : { lineitem: service.lineitemUrl }),
  };
}

export function buildNrpsLaunchClaimValue(
  overrides: TestNrpsLaunchServiceOverrides = {},
): Record<string, unknown> {
  const service = buildNrpsLaunchService(overrides);

  return {
    context_memberships_url: service.contextMembershipsUrl,
    service_versions: service.serviceVersions,
  };
}
