import { assertEquals } from '@std/assert';
import { createInMemoryPackageReviewRepository } from '../test_helpers/package_review.ts';
import {
  buildAppGenerationRunRecord,
  buildAppGenerationWorkspaceRecord,
} from '../test_helpers/package_review_in_memory_app_generation.ts';
import { buildGenerationResult } from './service_test_support.ts';
import { saveGenerationWorkspaceSnapshot } from './service_workspace_snapshot.ts';

Deno.test('generation workspace snapshots keep only protected context outside the authoritative result', async () => {
  const repository = createInMemoryPackageReviewRepository({
    appGenerationWorkspaces: [
      buildAppGenerationWorkspaceRecord({
        files: [
          {
            path: 'AGENTS.md',
            role: 'instruction',
            contents: 'Use the Lantern contract.\n',
          },
          {
            path: '.lantern/contracts/generated-app.md',
            role: 'contract',
            contents: 'Generated app contract.\n',
          },
          {
            path: 'source/app.ts',
            role: 'evidence',
            contents: 'console.log("stale source");\n',
          },
        ],
      }),
    ],
  });
  const saved = await saveGenerationWorkspaceSnapshot({
    repository,
    run: buildAppGenerationRunRecord({
      generationId: 'generation-1',
      repairAttemptCount: 1,
      updatedAt: '2026-05-14T12:00:05.000Z',
    }),
    generation: buildGenerationResult(),
    validationFindings: [],
  });

  assertEquals(
    saved.files.some((file) => file.path === 'AGENTS.md' && file.role === 'instruction'),
    true,
  );
  assertEquals(
    saved.files.some((file) =>
      file.path === '.lantern/contracts/generated-app.md' && file.role === 'contract'
    ),
    true,
  );
  assertEquals(
    saved.files.some((file) => file.path === 'source/app.ts'),
    false,
  );
});
