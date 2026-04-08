const EVIDENCE_ARTIFACT_STORAGE_PREFIX = "var/attempt-evidence/";

export interface EvidenceArtifactStore {
  writeBytes(storageKey: string, bytes: Uint8Array): Promise<void>;
  readBytes(storageKey: string): Promise<Uint8Array>;
}

export function assertEvidenceArtifactStorageKey(storageKey: string): string {
  if (
    storageKey.trim() === "" ||
    storageKey.startsWith("/") ||
    storageKey.includes("..") ||
    !storageKey.startsWith(EVIDENCE_ARTIFACT_STORAGE_PREFIX)
  ) {
    throw new Error(
      "Evidence artifact storage key must stay inside var/attempt-evidence/.",
    );
  }

  return storageKey;
}
