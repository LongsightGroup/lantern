import { assertEquals } from "@std/assert";
import type { DeploymentBinding, RuntimeSessionRecord } from "./lti/types.ts";
import {
  buildLaunchServiceClaims,
  buildMoodleDeploymentBinding,
  buildRuntimeSessionRecord,
  buildSakaiDeploymentBinding,
} from "./test_helpers/lti.ts";

interface SmokeFixture {
  binding: Extract<DeploymentBinding, { lms: "moodle" | "sakai" }>;
  session: RuntimeSessionRecord;
  appTitle: string;
  expectedSmokeLineItem: {
    resourceId: string;
    tag: "smoke-verification";
    label: string;
    scoreMaximum: 1;
  };
}

function buildSmokeFixture(lms: "moodle" | "sakai"): SmokeFixture {
  const binding = lms === "moodle"
    ? buildMoodleDeploymentBinding()
    : buildSakaiDeploymentBinding();
  const appTitle = "Chapter 4 Asteroids";

  return {
    binding,
    session: buildRuntimeSessionRecord({
      deploymentRecordId: lms === "moodle" ? 2 : 3,
      deploymentSlug: `chapter-4-asteroids-${lms}`,
      attemptId: `${lms}-attempt-123`,
      servicesLms: lms,
      services: buildLaunchServiceClaims({
        lms,
        ags: {
          lineitemUrl: null,
        },
      }),
      launch: {
        userRole: "learner",
        courseId: `${lms}-course-42`,
        assignmentId: `${lms}-assignment-9`,
        activityId: "activity-123",
      },
    }),
    appTitle,
    expectedSmokeLineItem: {
      resourceId: `lantern:chapter-4-asteroids:${lms}:smoke`,
      tag: "smoke-verification",
      label: `${appTitle} Smoke Verification`,
      scoreMaximum: 1,
    },
  };
}

Deno.test(
  "grade smoke scaffolding seeds one blessed Moodle smoke path with a dedicated smoke line item identity",
  () => {
    const fixture = buildSmokeFixture("moodle");

    assertEquals(fixture.binding.lms, "moodle");
    assertEquals(
      fixture.session.services.ags?.lineitemsUrl,
      "https://moodle.example/mod/lti/services.php/2/lineitems",
    );
    assertEquals(
      fixture.expectedSmokeLineItem.resourceId,
      "lantern:chapter-4-asteroids:moodle:smoke",
    );
    assertEquals(fixture.expectedSmokeLineItem.tag, "smoke-verification");
    assertEquals(fixture.expectedSmokeLineItem.scoreMaximum, 1);
  },
);

Deno.test(
  "grade smoke scaffolding seeds one blessed Sakai smoke path with a dedicated smoke line item identity",
  () => {
    const fixture = buildSmokeFixture("sakai");

    assertEquals(fixture.binding.lms, "sakai");
    assertEquals(
      fixture.session.services.ags?.lineitemsUrl,
      "https://sakai.example/direct/lti/lineitems/course-42/items",
    );
    assertEquals(
      fixture.expectedSmokeLineItem.resourceId,
      "lantern:chapter-4-asteroids:sakai:smoke",
    );
    assertEquals(fixture.expectedSmokeLineItem.tag, "smoke-verification");
    assertEquals(fixture.expectedSmokeLineItem.scoreMaximum, 1);
  },
);

Deno.test.ignore(
  "grade smoke verification records a bounded token failure without reusing the learner final-grade line item",
  () => {},
);

Deno.test.ignore(
  "grade smoke verification records a bounded AGS publish failure for the saved deployment binding",
  () => {},
);
