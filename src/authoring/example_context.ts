import { getReferencePackageSourceRoot } from '../package_review/intake.ts';
import { createFileSystemPackageSource } from '../package_review/package_source_fs.ts';
import { readBrowserAutograderContract } from '../package_review/repository_authoring.ts';
import { trimLeadingSlash } from '../package_review/snapshot_path.ts';
import type { AuthoringReferenceExample } from './ai_writer.ts';

const AUTHORING_REFERENCE_APP_IDS = [
  'template-app',
  'web-checkup',
  'office-hours-web-lab',
] as const;

export async function loadAuthoringReferenceExamples(): Promise<AuthoringReferenceExample[]> {
  return await Promise.all(
    AUTHORING_REFERENCE_APP_IDS.map((appId) => loadAuthoringReferenceExample(appId)),
  );
}

async function loadAuthoringReferenceExample(
  appId: (typeof AUTHORING_REFERENCE_APP_IDS)[number],
): Promise<AuthoringReferenceExample> {
  const source = createFileSystemPackageSource(getReferencePackageSourceRoot(appId));
  const manifest = await readReferenceManifest(source, appId);
  const contract = readBrowserAutograderContract(manifest);
  const files: AuthoringReferenceExample['files'] = [];

  for (const path of contract.paths) {
    const contents = await source.readText(trimLeadingSlash(path));

    if (contents === null) {
      throw new Error(`Reference example ${appId} is missing ${path}.`);
    }

    files.push({ path, contents });
  }

  return { appId, files };
}

async function readReferenceManifest(
  source: ReturnType<typeof createFileSystemPackageSource>,
  appId: string,
): Promise<Record<string, unknown>> {
  const manifestText = await source.readText('manifest.json');

  if (manifestText === null) {
    throw new Error(`Reference example ${appId} is missing manifest.json.`);
  }

  let manifestJson: unknown;

  try {
    manifestJson = JSON.parse(manifestText);
  } catch {
    throw new Error(`Reference example ${appId} has invalid manifest.json.`);
  }

  if (!manifestJson || typeof manifestJson !== 'object' || Array.isArray(manifestJson)) {
    throw new Error(`Reference example ${appId} manifest.json must be a JSON object.`);
  }

  return manifestJson as Record<string, unknown>;
}
