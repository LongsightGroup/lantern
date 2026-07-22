import type { PackageReviewRepository } from '../package_review/repository.ts';
import type { PreviewEvidenceRecord, PreviewSessionRecord } from '../package_review/types.ts';
import {
  loadPreviewRuntimeDiagnostics,
  type PreviewRuntimeDiagnostic,
} from './runtime_diagnostics.ts';

/** Loads the latest admin preview and its governed capability evidence. */
export async function loadPreviewCapabilityLog(input: {
  readonly repository: PackageReviewRepository;
  readonly packageVersionId: number;
}): Promise<{
  readonly session: PreviewSessionRecord | null;
  readonly evidence: PreviewEvidenceRecord[];
  readonly diagnostics: PreviewRuntimeDiagnostic[];
}> {
  const session = await input.repository.getLatestPreviewSessionByPackageVersion(
    input.packageVersionId,
    'adminTestLaunch',
  );
  if (session === null) {
    return { session: null, evidence: [], diagnostics: [] };
  }

  const [evidence, diagnostics] = await Promise.all([
    input.repository.listPreviewEvidence(session.sessionId),
    loadPreviewRuntimeDiagnostics({
      repository: input.repository,
      session,
    }),
  ]);
  return { session, evidence, diagnostics };
}
