import { assertEquals, assertExists } from "@std/assert";
import {
  buildDeepLinkingSelectionValue,
  createDeepLinkingSession,
  requireAuthorizedDeepLinkingSession,
  resolveDeepLinkingSelection,
  saveDeepLinkingSessionSelection,
  validateDeepLinkingRequest,
} from "./deep_linking.ts";
import {
  buildDeepLinkingSessionRecord,
  buildDeploymentBinding,
  buildLoginStateRecord,
  buildValidatedDeepLinkingRequest,
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

Deno.test(
  "deep linking validator accepts a supported assignment-selection launch and preserves authoring settings",
  async () => {
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
          createdAt: "2026-03-24T16:10:00Z",
          expiresAt: "2026-03-24T16:20:00Z",
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
      roles: [
        "http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor",
      ],
    });
    const request = await validateDeepLinkingRequest({
      repository,
      state: "state-deep-linking",
      idToken,
      now: () => new Date("2026-03-24T16:15:00Z"),
      loadJwks: () => Promise.resolve(getTestCanvasJwks()),
    });

    assertEquals(request?.placement, "assignment_selection");
    assertEquals(request?.userId, null);
    assertEquals(request?.userRole, "instructor");
    assertEquals(request?.settings.acceptTypes, ["ltiResourceLink"]);
    assertEquals(
      request?.deepLinkReturnUrl,
      "https://canvas.example/courses/42/deep_link_return",
    );
    const savedState = await repository.getLoginStateByState(
      "state-deep-linking",
    );

    assertEquals(savedState?.usedAt !== null, true);
  },
);

Deno.test(
  "createDeepLinkingSession persists a short-lived authoring session without creating runtime state",
  async () => {
    const repository = createInMemoryPackageReviewRepository({
      deployments: [
        buildDeploymentRecord({
          id: 7,
          appId: "chapter-4-asteroids",
          binding: buildDeploymentBinding(),
        }),
      ],
    });
    const tokens = ["deep-linking-session-456", "deep-linking-token-456"];
    const session = await createDeepLinkingSession({
      repository,
      request: buildValidatedDeepLinkingRequest({
        internalDeploymentId: 7,
        internalDeploymentSlug: "chapter-4-asteroids-pilot",
      }),
      now: () => new Date("2026-03-24T16:20:00Z"),
      createOpaqueToken: () => {
        const next = tokens.shift();

        if (!next) {
          throw new Error("Expected another deterministic deep linking token.");
        }

        return next;
      },
    });
    const saved = await repository.getDeepLinkingSessionById(
      "deep-linking-session-456",
    );
    const runtimeSession = await repository
      .getLatestRuntimeSessionByDeploymentId(
        7,
      );
    const attempt = await repository.getAttemptById("attempt-123");

    assertEquals(session.sessionId, "deep-linking-session-456");
    assertEquals(session.sessionToken, "deep-linking-token-456");
    assertEquals(session.deepLinkReturnUrl.includes("deep_link_return"), true);
    assertEquals(saved?.selection, null);
    assertEquals(runtimeSession, null);
    assertEquals(attempt, null);
  },
);

Deno.test(
  "deep linking validator rejects unsupported content-item types without consuming login state",
  async () => {
    const repository = createInMemoryPackageReviewRepository({
      deployments: [
        buildDeploymentRecord({
          id: 7,
          appId: "chapter-4-asteroids",
          binding: buildDeploymentBinding(),
        }),
      ],
      loginStates: [
        buildLoginStateRecord({
          state: "state-deep-linking-unsupported",
          nonce: "nonce-deep-linking-unsupported",
          targetLinkUri: "http://localhost:8000/lti/deep-linking",
          createdAt: "2026-03-24T16:10:00Z",
          expiresAt: "2026-03-24T16:20:00Z",
        }),
      ],
    });
    const idToken = await signCanvasIdToken({
      nonce: "nonce-deep-linking-unsupported",
      subject: null,
      messageType: LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
      targetLinkUri: "http://localhost:8000/lti/deep-linking",
      deepLinkReturnUrl: "https://canvas.example/courses/42/deep_link_return",
      deepLinkAcceptTypes: ["html"],
    });

    await assertRejectsDeepLinking(
      () =>
        validateDeepLinkingRequest({
          repository,
          state: "state-deep-linking-unsupported",
          idToken,
          now: () => new Date("2026-03-24T16:15:00Z"),
          loadJwks: () => Promise.resolve(getTestCanvasJwks()),
        }),
      "Unsupported Deep Linking accept_types: html.",
    );

    const savedState = await repository.getLoginStateByState(
      "state-deep-linking-unsupported",
    );

    assertEquals(savedState?.usedAt, null);
  },
);

Deno.test(
  "deep linking helpers authorize the picker session and store one explicit reviewed selection",
  async () => {
    const repository = createInMemoryPackageReviewRepository({
      deepLinkingSessions: [
        buildDeepLinkingSessionRecord({
          sessionId: "deep-linking-session-picker",
          sessionToken: "deep-linking-token-picker",
        }),
      ],
      deepLinkingResourceOptions: [
        buildDeepLinkingResourceOption(),
        buildDeepLinkingResourceOption({
          packageVersionId: 2,
          packageVersion: "0.2.0",
          contentPath: "/content/bonus.json",
          activityId: "/content/bonus.json",
          contentTitle: "Bonus Activity",
        }),
        buildDeepLinkingResourceOption({
          appId: "other-app",
          packageTitle: "Other App",
        }),
      ],
    });
    const session = await requireAuthorizedDeepLinkingSession({
      repository,
      sessionId: "deep-linking-session-picker",
      token: "deep-linking-token-picker",
      now: () => new Date("2026-03-23T22:46:00Z"),
    });
    const saved = await saveDeepLinkingSessionSelection({
      repository,
      session,
      selectionValue: buildDeepLinkingSelectionValue({
        packageVersionId: 2,
        contentPath: "/content/bonus.json",
      }),
    });
    const resources = await repository.listDeepLinkingResourceOptions(
      session.appId,
    );
    const selection = resolveDeepLinkingSelection({
      session: saved.session,
      resources,
    });

    assertEquals(resources.length, 2);
    assertEquals(saved.session.selection?.packageVersionId, 2);
    assertEquals(saved.session.selection?.contentPath, "/content/bonus.json");
    assertEquals(saved.selection.packageTitle, "Chapter 4 Asteroids");
    assertEquals(selection?.contentTitle, "Bonus Activity");
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

async function assertRejectsDeepLinking(
  run: () => Promise<unknown>,
  message: string,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    assertEquals(error instanceof Error, true);
    assertEquals((error as Error).message, message);
    return;
  }

  throw new Error("Expected Deep Linking validation to reject.");
}
