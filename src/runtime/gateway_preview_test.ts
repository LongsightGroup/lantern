import { assertEquals, assertRejects } from "@std/assert";
import { acceptAttemptEvent, finalizeRuntimeAttempt } from "./gateway.ts";
import { RuntimeBrokerDenialError } from "./gateway_errors.ts";
import { buildRuntimeSessionRecord } from "../test_helpers/lti.ts";
import {
  buildAttemptEventRecord,
  buildAttemptRecord,
  buildPackageVersionRecord,
  buildPreviewSessionRecord,
  createInMemoryPackageReviewRepository,
} from "../test_helpers/package_review.ts";
import { withFetchStub } from "./gateway_test_helpers.ts";

Deno.test("preview gateway finalize returns fake scoring and never calls Canvas side-effect services", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        grading: {
          mode: "declarative",
          rubricFile: "/scoring/rubric.json",
          maxScore: 100,
        },
      }),
    ],
    previewSessions: [
      buildPreviewSessionRecord({
        sessionId: "preview-session-finalize-fake",
        fakeAttemptId: "preview-attempt-123",
        fakeScoreMaximum: 42,
      }),
    ],
    attempts: [
      buildAttemptRecord({
        attemptId: "preview-attempt-123",
        deploymentRecordId: 0,
      }),
    ],
    attemptEvents: [
      buildAttemptEventRecord({
        attemptId: "preview-attempt-123",
        event: {
          type: "complete",
          timestamp: "2026-03-24T02:31:00Z",
        },
      }),
    ],
  });
  const session = buildRuntimeSessionRecord({
    attemptId: "preview-attempt-123",
    deploymentRecordId: 0,
    deploymentSlug: "chapter-4-asteroids-preview",
    services: {
      ags: null,
      nrps: null,
    },
    preview: {
      previewSessionId: "preview-session-finalize-fake",
    },
  });

  await withFetchStub(
    () => {
      throw new Error(
        "Canvas fetch should not be called for preview finalize.",
      );
    },
    async () => {
      const result = await finalizeRuntimeAttempt({
        repository,
        session,
        payload: {
          completionState: "completed",
        },
        now: () => new Date("2026-03-24T02:35:00Z"),
      });

      assertEquals(result.finalizedNow, true);
      assertEquals(result.score, {
        scoreGiven: 0,
        scoreMaximum: 42,
      });
      assertEquals(result.lineItemBinding, null);
      assertEquals(result.gradePublication, null);
      assertEquals(result.gradePublishedNow, false);
      assertEquals(result.publishError, null);
    },
  );
});

Deno.test("preview gateway enforces declared capabilities and records bounded blocked-capability evidence", async () => {
  const repository = createInMemoryPackageReviewRepository({
    previewSessions: [
      buildPreviewSessionRecord({
        sessionId: "preview-session-capability-block",
        capabilities: ["read_launch_context"],
      }),
    ],
    attempts: [
      buildAttemptRecord({
        attemptId: "preview-attempt-123",
        deploymentRecordId: 0,
      }),
    ],
  });
  const session = buildRuntimeSessionRecord({
    attemptId: "preview-attempt-123",
    deploymentRecordId: 0,
    deploymentSlug: "chapter-4-asteroids-preview",
    capabilities: ["read_launch_context"],
    services: {
      ags: null,
      nrps: null,
    },
    preview: {
      previewSessionId: "preview-session-capability-block",
    },
  });

  const error = await assertRejects(
    () =>
      acceptAttemptEvent({
        repository,
        session,
        payload: {
          type: "answer",
          questionId: "q1",
          answer: "asteroid",
          timestamp: "2026-03-24T02:30:00Z",
        },
        now: () => new Date("2026-03-24T02:31:00Z"),
      }),
    RuntimeBrokerDenialError,
  ) as RuntimeBrokerDenialError;

  assertEquals(error.category, "policyDenied");
  assertEquals(error.code, "capability_not_granted");

  assertEquals(await repository.listAttemptEvents("preview-attempt-123"), []);
  const evidence = await repository.listPreviewEvidence(
    "preview-session-capability-block",
  );
  assertEquals(evidence.length, 1);
  assertEquals(evidence[0]?.eventType, "preview.attempt_event.blocked");
  assertEquals(evidence[0]?.capability, "submit_attempt_event");
});

Deno.test("preview gateway blocks live-service finalize paths clearly and records failure evidence", async () => {
  const repository = createInMemoryPackageReviewRepository({
    previewSessions: [
      buildPreviewSessionRecord({
        sessionId: "preview-session-live-service-block",
        fakeAttemptId: "preview-attempt-123",
      }),
    ],
    packageVersions: [buildPackageVersionRecord()],
    attempts: [
      buildAttemptRecord({
        attemptId: "preview-attempt-123",
        deploymentRecordId: 0,
      }),
    ],
  });
  const session = buildRuntimeSessionRecord({
    attemptId: "preview-attempt-123",
    deploymentRecordId: 0,
    deploymentSlug: "chapter-4-asteroids-preview",
    preview: {
      previewSessionId: "preview-session-live-service-block",
    },
  });

  const error = await assertRejects(
    () =>
      finalizeRuntimeAttempt({
        repository,
        session,
        payload: {
          completionState: "completed",
        },
        now: () => new Date("2026-03-24T02:35:00Z"),
      }),
    RuntimeBrokerDenialError,
  ) as RuntimeBrokerDenialError;

  assertEquals(error.category, "policyDenied");
  assertEquals(error.code, "preview_live_side_effects_blocked");

  const evidence = await repository.listPreviewEvidence(
    "preview-session-live-service-block",
  );
  assertEquals(evidence.length, 1);
  assertEquals(evidence[0]?.eventType, "preview.finalize.blocked");
  assertEquals(evidence[0]?.capability, "finalize_attempt");
});
