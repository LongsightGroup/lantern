import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  assertEvidenceArtifactStorageKey,
  type EvidenceArtifactStore,
} from './evidence_artifact_store.ts';

const FILE_SYSTEM_EVIDENCE_ARTIFACT_STORE: EvidenceArtifactStore = {
  async writeBytes(storageKey, bytes) {
    const safeStorageKey = assertEvidenceArtifactStorageKey(storageKey);
    const directory = safeStorageKey.split('/').slice(0, -1).join('/');

    await mkdir(directory, { recursive: true });
    await writeFile(safeStorageKey, bytes);
  },

  async readBytes(storageKey) {
    return await readFile(assertEvidenceArtifactStorageKey(storageKey));
  },
};

export function getDefaultEvidenceArtifactStore(): EvidenceArtifactStore {
  return FILE_SYSTEM_EVIDENCE_ARTIFACT_STORE;
}
