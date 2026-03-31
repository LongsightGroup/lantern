import { assertEquals, assertStringIncludes } from "@std/assert";
import { createApp } from "./app.ts";
import {
  LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
  LTI_RESOURCE_LINK_REQUEST_MESSAGE_TYPE,
} from "./lti/types.ts";
import {
  buildDeploymentRecord,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from "./test_helpers/package_review.ts";
import {
  buildLoginStateRecord,
  buildSakaiDeploymentBinding,
  getTestCanvasJwks,
  signCanvasIdToken,
} from "./test_helpers/lti.ts";
import { withFetchStub } from "./app_test_support.ts";

Deno.test("POST /lti/launch rejects Sakai authoring-mode requests and never creates a runtime session", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 5,
        approvalStatus: "approved",
        reviewNotes: "Ready for pilot.",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 17,
        slug: "chapter-4-asteroids-sakai",
        label: "Chapter 4 Asteroids Sakai Deployment",
        enabledPackageVersionId: 5,
        enabledPackageVersion: "0.1.0",
        binding: buildSakaiDeploymentBinding({
          issuer: "https://sakai.example",
          clientId: "sakai-client-123",
          deploymentId: "sakai-deployment-123",
        }),
      }),
    ],
    loginStates: [
      buildLoginStateRecord({
        lms: "sakai",
        issuer: "https://sakai.example",
        clientId: "sakai-client-123",
        deploymentId: "sakai-deployment-123",
        state: "state-sakai-authoring",
        nonce: "nonce-sakai-authoring",
        expiresAt: "2030-03-26T02:45:00Z",
      }),
    ],
  });
  const formData = new FormData();

  formData.set("state", "state-sakai-authoring");
  formData.set(
    "id_token",
    await signCanvasIdToken({
      deploymentBinding: {
        issuer: "https://sakai.example",
        clientId: "sakai-client-123",
        deploymentId: "sakai-deployment-123",
      },
      nonce: "nonce-sakai-authoring",
      audience: "sakai-client-123",
      issuedAt: "2026-03-24T00:45:00Z",
      expirationTime: "2h",
      messageType: LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
      deepLinkReturnUrl: "https://sakai.example/portal/site/course",
    }),
  );

  await withFetchStub(
    () =>
      Promise.resolve(
        new Response(JSON.stringify(getTestCanvasJwks()), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    async () => {
      const response = await createApp({
        getRepository: () => repository,
      }).request("http://localhost/lti/launch", {
        method: "POST",
        body: formData,
      });
      const body = await response.text();
      const savedState = await repository.getLoginStateByState(
        "state-sakai-authoring",
      );
      const runtimeSession = await repository
        .getLatestRuntimeSessionByDeploymentId(17);
      const auditEvents = await repository.listAuditEventsByEventType(
        "launch.rejected",
      );

      assertEquals(response.status, 409);
      assertStringIncludes(
        body,
        "Launch rejected because /lti/launch only accepts LtiResourceLinkRequest for the governed runtime baseline.",
      );
      assertEquals(savedState?.usedAt, null);
      assertEquals(runtimeSession, null);
      assertEquals(auditEvents.length, 1);
      assertEquals(auditEvents[0]?.detail.lms, "sakai");
      assertEquals(auditEvents[0]?.detail.code, "unsupported_message_type");
      assertEquals(
        auditEvents[0]?.detail.message,
        "Launch rejected because /lti/launch only accepts LtiResourceLinkRequest for the governed runtime baseline.",
      );
      assertEquals(
        auditEvents[0]?.detail.messageType,
        LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
      );
      assertEquals(
        auditEvents[0]?.detail.supportedMessageType,
        LTI_RESOURCE_LINK_REQUEST_MESSAGE_TYPE,
      );
    },
  );
});
