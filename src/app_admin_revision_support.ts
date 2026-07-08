import { recordAppWriterWorkflowQueuedEvent } from './app_writer/background_execution.ts';
import { requireTrimmedFormValue } from './app_request_support.ts';
import type { PackageReviewRepository } from './package_review/repository.ts';
import type { AppGenerationRunRecord } from './app_writer/types.ts';

export { resolvePreviousPackageVersion } from './admin/package_version_history.ts';

export async function recordRevisionWorkflowQueuedEvent(input: {
  repository: PackageReviewRepository;
  run: AppGenerationRunRecord;
  workflowInstanceId: string | null;
}): Promise<void> {
  await recordAppWriterWorkflowQueuedEvent({
    repository: input.repository,
    run: input.run,
    workflowInstanceId: input.workflowInstanceId,
    summary: 'Queued app writer revision in Cloudflare Workflow.',
  });
}

export function requireVersionString(value: FormDataEntryValue | null): string {
  const version = requireTrimmedFormValue(value, 'Choose a target version for the revision.');

  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/.test(version)) {
    throw new Error('Revision target version must be a semantic version like 0.2.0.');
  }

  return version;
}

export function nextRevisionVersion(
  sourceVersion: string,
  history: readonly { version: string }[],
): string {
  let candidate = incrementMinorVersion(sourceVersion);
  const existingVersions = new Set(history.map((version) => version.version));

  while (existingVersions.has(candidate)) {
    candidate = incrementMinorVersion(candidate);
  }

  return candidate;
}

function incrementMinorVersion(version: string): string {
  const match = version.match(/^([0-9]+)\.([0-9]+)\.[0-9]+/);

  if (match === null) {
    return '0.2.0';
  }

  return `${match[1]}.${Number(match[2]) + 1}.0`;
}
