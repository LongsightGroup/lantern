import { assertStringIncludes } from "@std/assert";
import { renderPackageOverviewPage } from "./package_overview.ts";
import {
  buildDeploymentRecord,
  buildPackageVersionRecord,
} from "../test_helpers/package_review.ts";
import { buildCanvasDeploymentBinding } from "../test_helpers/lti.ts";

Deno.test("renderPackageOverviewPage keeps latest approved distinct from live rollout", () => {
  const body = renderPackageOverviewPage({
    appId: "office-hours-web-lab",
    appTitle: "Office Hours Web Lab",
    history: [
      buildPackageVersionRecord({
        id: 3,
        appId: "office-hours-web-lab",
        title: "Office Hours Web Lab",
        version: "0.2.1",
        approvalStatus: "approved",
        importedAt: "2026-04-09T22:38:00Z",
      }),
      buildPackageVersionRecord({
        id: 2,
        appId: "office-hours-web-lab",
        title: "Office Hours Web Lab",
        version: "0.2.0",
        approvalStatus: "approved",
        importedAt: "2026-04-09T21:27:00Z",
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        appId: "office-hours-web-lab",
        enabledPackageVersionId: 2,
        enabledPackageVersion: "0.2.0",
        binding: buildCanvasDeploymentBinding(),
      }),
    ],
  });

  assertStringIncludes(
    body,
    "Latest approved stays the current reviewed baseline. LMS setup decides which approved version is live.",
  );
  assertStringIncludes(body, "Latest approved");
  assertStringIncludes(body, "version-row-current");
  assertStringIncludes(body, "Live in 1 LMS setup");
  assertStringIncludes(body, "Not live");
  assertStringIncludes(body, "version-row-actions");
});
