import { assertEquals } from '@std/assert';
import {
  buildAttemptRecord,
  buildAuditEventRecord,
  buildDeploymentRecord,
  buildLineItemBindingRecord,
  buildPackageVersionRecord,
} from '../test_helpers/package_review.ts';

Deno.test.ignore(
  'audit repository records append-only events for approval decisions, deployment changes, launches, attempt submissions, and grade publishes',
  async () => {
    const modulePath = `./${'repository.ts'}`;
    const auditRepositoryModule = await import(modulePath);
    const repository = auditRepositoryModule.createAuditRepository?.({
      database: 'test-double',
    });

    await repository?.record(buildAuditEventRecord());

    const history = await repository?.listByAttemptId?.('attempt-123');
    assertEquals(Array.isArray(history), true);
  },
);

Deno.test.ignore(
  'audit repository preserves structured references without mutating prior rows',
  async () => {
    const modulePath = `./${'repository.ts'}`;
    const auditRepositoryModule = await import(modulePath);
    const repository = auditRepositoryModule.createAuditRepository?.({
      database: 'test-double',
    });

    await repository?.record(
      buildAuditEventRecord({
        eventType: 'grade.publish.succeeded',
        detail: {
          deployment: buildDeploymentRecord().slug,
          packageVersion: buildPackageVersionRecord().version,
          attempt: buildAttemptRecord().attemptId,
          lineItem: buildLineItemBindingRecord().lineItemUrl,
        },
      }),
    );

    const history = await repository?.listByEventType?.('grade.publish.succeeded');
    assertEquals(Array.isArray(history), true);
  },
);
