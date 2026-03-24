import { assertEquals, assertExists } from "@std/assert";
import {
  buildDeepLinkingSessionRecord,
  buildDeploymentBinding,
  buildLoginStateRecord,
  getTestCanvasJwks,
  signCanvasIdToken,
} from "../test_helpers/lti.ts";
import {
  buildDeepLinkingResourceOption,
  buildDeepLinkingResourceSelection,
  buildDeploymentRecord,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from "../test_helpers/package_review.ts";
import { LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE } from "./types.ts";

Deno.test(
  "deep linking launch helpers encode assignment-selection claims without requiring a subject claim",
  async () => {
    const token = await signCanvasIdToken({
      nonce: "nonce-deep-linking",
      subject: null,
      messageType: LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
      targetLinkUri: "http://localhost:8000/lti/deep-linking",
      deepLinkReturnUrl: "https://canvas.example/courses/42/deep_link_return",
      deepLinkData: "dl-state-123",
      deepLinkAcceptTypes: ["ltiResourceLink"],
      deepLinkAcceptPresentationDocumentTargets: ["iframe"],
      deepLinkAcceptLineItem: false,
    });
    const payload = decodeJwtPayload(token);
    const settings = payload[
      "https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings"
    ] as Record<string, unknown>;

    assertEquals(payload.sub, undefined);
    assertExists(settings);
    assertEquals(settings.accept_types, ["ltiResourceLink"]);
    assertEquals(settings.accept_multiple, false);
    assertEquals(settings.accept_presentation_document_targets, ["iframe"]);
    assertEquals(
      settings.deep_link_return_url,
      "https://canvas.example/courses/42/deep_link_return",
    );
  },
);

Deno.test(
  "deep linking in-memory fixtures preserve reviewed resources and explicit session selection",
  async () => {
    const repository = createInMemoryPackageReviewRepository({
      deepLinkingSessions: [buildDeepLinkingSessionRecord()],
      deepLinkingResourceOptions: [
        buildDeepLinkingResourceOption(),
        buildDeepLinkingResourceOption({
          packageVersionId: 2,
          packageVersion: "0.2.0",
          activityId: "/content/bonus.json",
          contentPath: "/content/bonus.json",
          contentTitle: "Bonus Activity",
        }),
      ],
    });
    const initialSession = await repository.getDeepLinkingSessionById(
      "deep-linking-session-123",
    );
    const options = await repository.listDeepLinkingResourceOptions(
      "chapter-4-asteroids",
    );
    const updatedSession = await repository.updateDeepLinkingSessionSelection({
      sessionId: "deep-linking-session-123",
      selection: {
        ...buildDeepLinkingResourceSelection({
          packageVersionId: 2,
          packageVersion: "0.2.0",
          activityId: "/content/bonus.json",
          contentPath: "/content/bonus.json",
          contentTitle: "Bonus Activity",
        }),
      },
    });

    assertEquals(initialSession?.selection, null);
    assertEquals(options.length, 2);
    assertEquals(options[1]?.contentPath, "/content/bonus.json");
    assertEquals(updatedSession.selection?.packageVersionId, 2);
    assertEquals(updatedSession.selection?.contentPath, "/content/bonus.json");
  },
);

Deno.test.ignore(
  "deep linking validator accepts a supported assignment-selection launch and preserves authoring settings",
  async () => {
    const modulePath = `./${"deep_linking.ts"}`;
    const deepLinkingModule = await import(modulePath);
    const repository = createInMemoryPackageReviewRepository({
      packageVersions: [
        buildPackageVersionRecord({
          id: 1,
          installScope: "assignment",
          approvalStatus: "approved",
          reviewedAt: "2026-03-24T16:15:00Z",
        }),
      ],
      deployments: [
        buildDeploymentRecord({
          id: 7,
          enabledPackageVersionId: 1,
          enabledPackageVersion: "0.1.0",
          binding: buildDeploymentBinding(),
        }),
      ],
      loginStates: [
        buildLoginStateRecord({
          state: "state-deep-linking",
          nonce: "nonce-deep-linking",
          targetLinkUri: "http://localhost:8000/lti/deep-linking",
        }),
      ],
    });
    const idToken = await signCanvasIdToken({
      nonce: "nonce-deep-linking",
      subject: null,
      messageType: LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
      targetLinkUri: "http://localhost:8000/lti/deep-linking",
      deepLinkReturnUrl: "https://canvas.example/courses/42/deep_link_return",
      deepLinkData: "dl-state-123",
    });
    const request = await deepLinkingModule.validateDeepLinkingRequest?.({
      repository,
      state: "state-deep-linking",
      idToken,
      now: () => new Date("2026-03-24T16:15:00Z"),
      loadJwks: () => Promise.resolve(getTestCanvasJwks()),
    });

    assertEquals(request?.placement, "assignment_selection");
    assertEquals(request?.settings.acceptTypes, ["ltiResourceLink"]);
    assertEquals(
      request?.deepLinkReturnUrl,
      "https://canvas.example/courses/42/deep_link_return",
    );
  },
);

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  const payload = parts[1];

  if (!payload) {
    throw new Error("JWT payload segment is required.");
  }

  const normalized = payload.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);

  return JSON.parse(atob(padded)) as Record<string, unknown>;
}
