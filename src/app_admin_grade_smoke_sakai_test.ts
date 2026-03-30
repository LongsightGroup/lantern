import { assertEquals } from "@std/assert";
import { createApp } from "./app.ts";
import {
  restoreEnv,
  withFetchStub,
} from "./admin/deployment_detail_test_helpers.ts";
import { getTestToolPrivateJwkEnvValue } from "./test_helpers/lti.ts";
import {
  buildSmokeRouteFixture,
  buildSmokeVerificationFormData,
  createSmokeRouteRepository,
  createSuccessfulSmokeFetchHandler,
} from "./app_admin_grade_smoke_test_support.ts";

Deno.test("POST /admin/packages/:appId/deployment/verify-grade-smoke runs the blessed Sakai smoke path and records deployment-scoped evidence", async () => {
  const previousToolKey = Deno.env.get("LTI_TOOL_PRIVATE_JWK");
  const fixture = buildSmokeRouteFixture("sakai");
  const repository = createSmokeRouteRepository(fixture);
  const requestedUrls: string[] = [];
  const formData = buildSmokeVerificationFormData(fixture);
  Deno.env.set("LTI_TOOL_PRIVATE_JWK", getTestToolPrivateJwkEnvValue());

  try {
    await withFetchStub(
      createSuccessfulSmokeFetchHandler(fixture, requestedUrls),
      async () => {
        const response = await createApp({
          getRepository: () => repository,
        }).request(
          "http://localhost/admin/packages/chapter-4-asteroids/deployment/verify-grade-smoke",
          {
            method: "POST",
            headers: {
              Origin: "http://localhost",
            },
            body: formData,
          },
        );

        assertEquals(response.status, 303);
        assertEquals(
          response.headers.get("location"),
          "/admin/packages/chapter-4-asteroids/deployment?lms=sakai#slot-panel",
        );

        const auditEvents = await repository.listAuditEventsByEventType(
          "deployment.ags_smoke_verified",
        );

        assertEquals(auditEvents.length, 1);
        assertEquals(auditEvents[0]?.status, "succeeded");
        assertEquals(auditEvents[0]?.deploymentRecordId, fixture.deploymentId);
        assertEquals(auditEvents[0]?.detail.lms, "sakai");
        assertEquals(auditEvents[0]?.detail.agsCapable, true);
        assertEquals(auditEvents[0]?.detail.publicationStatus, "succeeded");
        assertEquals(
          auditEvents[0]?.detail.lineItemUrl,
          fixture.smokeLineItemUrl,
        );
        assertEquals(
          requestedUrls.includes(
            `POST ${fixture.finalGradeLineItemUrl}/scores`,
          ),
          false,
        );
      },
    );
  } finally {
    restoreEnv("LTI_TOOL_PRIVATE_JWK", previousToolKey);
  }
});
