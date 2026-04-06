import { assertEquals } from '@std/assert';
import { resetPackageReviewTables } from '../test_helpers/postgres.ts';
import {
  buildAttemptRecord,
  buildAuditEventRecord,
  buildGradePublicationRecord,
  buildLineItemBindingRecord,
} from '../test_helpers/package_review.ts';
import {
  buildImportedPackageVersion,
  withRepositoryTestDatabase,
} from './repository_test_support.ts';

Deno.test('repository records append-only audit events in order and resetPackageReviewTables clears phase 3 rows', async () => {
  await withRepositoryTestDatabase(async ({ pool, repository }) => {
    const approvedRecord = await repository.approvePackageVersion({
      id: (await repository.registerPackageVersion(await buildImportedPackageVersion())).id,
      reviewNotes: 'Approved for audit trail tests.',
    });
    const deployment = await repository.pinDeploymentVersion({
      slug: 'chapter-4-asteroids-pilot',
      label: 'Chapter 4 Asteroids Pilot Deployment',
      appId: 'chapter-4-asteroids',
      packageVersionId: approvedRecord.id,
    });
    const attempt = await repository.createAttempt(
      buildAttemptRecord({
        deploymentRecordId: deployment.id,
        deploymentSlug: deployment.slug,
        packageVersionId: approvedRecord.id,
        packageVersion: approvedRecord.version,
      }),
    );

    await repository.recordAuditEvent(
      buildAuditEventRecord({
        eventType: 'launch.accepted',
        summary: 'Accepted the governed launch.',
        deploymentRecordId: deployment.id,
        packageVersionId: approvedRecord.id,
        attemptId: attempt.attemptId,
      }),
    );
    await repository.recordAuditEvent(
      buildAuditEventRecord({
        id: 2,
        eventType: 'attempt.submitted',
        summary: 'Accepted the attempt submission.',
        deploymentRecordId: deployment.id,
        packageVersionId: approvedRecord.id,
        attemptId: attempt.attemptId,
        occurredAt: '2026-03-24T02:31:00Z',
      }),
    );

    const history = await repository.listAuditEventsByAttemptId(attempt.attemptId);

    assertEquals(
      history.map((event) => event.eventType),
      ['launch.accepted', 'attempt.submitted'],
    );
    assertEquals(history[0]?.summary, 'Accepted the governed launch.');

    await resetPackageReviewTables(pool);

    assertEquals(await repository.getAttemptById(attempt.attemptId), null);
    assertEquals(await repository.listAuditEventsByAttemptId(attempt.attemptId), []);
  });
});

Deno.test('repository appends attempt events in sequence order for a durable attempt', async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const approvedRecord = await repository.approvePackageVersion({
      id: (await repository.registerPackageVersion(await buildImportedPackageVersion())).id,
      reviewNotes: 'Approved for attempt event tests.',
    });
    const deployment = await repository.pinDeploymentVersion({
      slug: 'chapter-4-asteroids-pilot',
      label: 'Chapter 4 Asteroids Pilot Deployment',
      appId: 'chapter-4-asteroids',
      packageVersionId: approvedRecord.id,
    });
    const attempt = await repository.createAttempt(
      buildAttemptRecord({
        deploymentRecordId: deployment.id,
        deploymentSlug: deployment.slug,
        packageVersionId: approvedRecord.id,
        packageVersion: approvedRecord.version,
      }),
    );

    await repository.appendAttemptEvent({
      attemptId: attempt.attemptId,
      event: {
        type: 'answer',
        questionId: 'q1',
        answer: 'asteroid',
        timestamp: '2026-03-24T02:30:00Z',
      },
      receivedAt: '2026-03-24T02:30:01Z',
    });
    await repository.appendAttemptEvent({
      attemptId: attempt.attemptId,
      event: { type: 'complete', timestamp: '2026-03-24T02:31:00Z' },
      receivedAt: '2026-03-24T02:31:01Z',
    });

    const events = await repository.listAttemptEvents(attempt.attemptId);

    assertEquals(
      events.map((event) => event.sequence),
      [1, 2],
    );
    assertEquals(
      events.map((event) => event.eventType),
      ['answer', 'complete'],
    );
  });
});

Deno.test('repository finalizes durable attempts idempotently', async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const approvedRecord = await repository.approvePackageVersion({
      id: (await repository.registerPackageVersion(await buildImportedPackageVersion())).id,
      reviewNotes: 'Approved for attempt finalize tests.',
    });
    const deployment = await repository.pinDeploymentVersion({
      slug: 'chapter-4-asteroids-pilot',
      label: 'Chapter 4 Asteroids Pilot Deployment',
      appId: 'chapter-4-asteroids',
      packageVersionId: approvedRecord.id,
    });
    const attempt = await repository.createAttempt(
      buildAttemptRecord({
        deploymentRecordId: deployment.id,
        deploymentSlug: deployment.slug,
        packageVersionId: approvedRecord.id,
        packageVersion: approvedRecord.version,
      }),
    );

    const firstFinalize = await repository.finalizeAttempt({
      attemptId: attempt.attemptId,
      status: 'completed',
      completionState: 'completed',
      finalizedAt: '2026-03-24T02:35:00Z',
    });
    const secondFinalize = await repository.finalizeAttempt({
      attemptId: attempt.attemptId,
      status: 'abandoned',
      completionState: 'abandoned',
      finalizedAt: '2026-03-24T02:40:00Z',
    });

    assertEquals(firstFinalize.status, 'completed');
    assertEquals(firstFinalize.completionState, 'completed');
    assertEquals(firstFinalize.finalizedAt, '2026-03-24T02:35:00.000Z');
    assertEquals(secondFinalize.status, 'completed');
    assertEquals(secondFinalize.completionState, 'completed');
    assertEquals(secondFinalize.finalizedAt, '2026-03-24T02:35:00.000Z');
  });
});

Deno.test('repository stores attempt-local state on Lantern-owned attempt rows and keeps it isolated per attempt', async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const approvedRecord = await repository.approvePackageVersion({
      id: (await repository.registerPackageVersion(await buildImportedPackageVersion())).id,
      reviewNotes: 'Approved for attempt local-state tests.',
    });
    const deployment = await repository.pinDeploymentVersion({
      slug: 'chapter-4-asteroids-pilot',
      label: 'Chapter 4 Asteroids Pilot Deployment',
      appId: 'chapter-4-asteroids',
      packageVersionId: approvedRecord.id,
    });
    const firstAttempt = await repository.createAttempt(
      buildAttemptRecord({
        deploymentRecordId: deployment.id,
        deploymentSlug: deployment.slug,
        packageVersionId: approvedRecord.id,
        packageVersion: approvedRecord.version,
      }),
    );
    const secondAttempt = await repository.createAttempt(
      buildAttemptRecord({
        id: 2,
        attemptId: 'attempt-456',
        deploymentRecordId: deployment.id,
        deploymentSlug: deployment.slug,
        packageVersionId: approvedRecord.id,
        packageVersion: approvedRecord.version,
        activityId: 'activity-456',
        resourceLinkId: 'resource-link-456',
      }),
    );

    assertEquals((await repository.getAttemptById(firstAttempt.attemptId))?.localState, null);

    const updatedAttempt = await repository.writeAttemptLocalState({
      attemptId: firstAttempt.attemptId,
      localState: {
        currentCheckpoint: 'wave-2',
        answers: {
          q1: 'asteroid',
        },
      },
    });

    assertEquals(updatedAttempt.localState, {
      currentCheckpoint: 'wave-2',
      answers: {
        q1: 'asteroid',
      },
    });
    assertEquals((await repository.getAttemptById(secondAttempt.attemptId))?.localState, null);
  });
});

Deno.test('repository stores package-version line item bindings and idempotent grade publications', async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const approvedRecord = await repository.approvePackageVersion({
      id: (await repository.registerPackageVersion(await buildImportedPackageVersion())).id,
      reviewNotes: 'Approved for AGS publication tests.',
    });
    const deployment = await repository.pinDeploymentVersion({
      slug: 'chapter-4-asteroids-pilot',
      label: 'Chapter 4 Asteroids Pilot Deployment',
      appId: 'chapter-4-asteroids',
      packageVersionId: approvedRecord.id,
    });
    const attempt = await repository.createAttempt(
      buildAttemptRecord({
        deploymentRecordId: deployment.id,
        deploymentSlug: deployment.slug,
        packageVersionId: approvedRecord.id,
        packageVersion: approvedRecord.version,
      }),
    );
    const savedBinding = await repository.saveLineItemBinding(
      buildLineItemBindingRecord({
        deploymentRecordId: deployment.id,
        packageVersionId: approvedRecord.id,
      }),
    );
    const reusedBinding = await repository.saveLineItemBinding(
      buildLineItemBindingRecord({
        deploymentRecordId: deployment.id,
        packageVersionId: approvedRecord.id,
      }),
    );
    const createdPublication = await repository.createGradePublication(
      buildGradePublicationRecord({
        attemptId: attempt.attemptId,
        lineItemBindingId: savedBinding.id,
        createdAt: '2026-03-24T02:35:00Z',
        updatedAt: '2026-03-24T02:35:00Z',
        publishedAt: null,
        status: 'pending',
        gradingProgress: 'Pending',
      }),
    );
    const reusedPublication = await repository.createGradePublication(
      buildGradePublicationRecord({
        attemptId: attempt.attemptId,
        lineItemBindingId: savedBinding.id,
        createdAt: '2026-03-24T02:35:00Z',
        updatedAt: '2026-03-24T02:35:00Z',
        publishedAt: null,
        status: 'pending',
        gradingProgress: 'Pending',
      }),
    );
    const published = await repository.updateGradePublication({
      attemptId: attempt.attemptId,
      status: 'published',
      updatedAt: '2026-03-24T02:36:00Z',
      publishedAt: '2026-03-24T02:36:00Z',
      errorCode: null,
      errorDetail: null,
    });
    const fetchedBinding = await repository.getLineItemBinding({
      deploymentRecordId: deployment.id,
      packageVersionId: approvedRecord.id,
      contextId: attempt.contextId,
      resourceLinkId: attempt.resourceLinkId,
      activityId: attempt.activityId,
    });
    const fetchedPublication = await repository.getGradePublicationByAttemptId(attempt.attemptId);

    assertEquals(savedBinding.id, reusedBinding.id);
    assertEquals(createdPublication.id, reusedPublication.id);
    assertEquals(published.status, 'published');
    assertEquals(published.publishedAt, '2026-03-24T02:36:00.000Z');
    assertEquals(fetchedBinding?.lineItemUrl, savedBinding.lineItemUrl);
    assertEquals(fetchedPublication?.status, 'published');
  });
});
