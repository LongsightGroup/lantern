import {
  assertEvidenceArtifactStorageKey,
  type EvidenceArtifactStore,
} from "./evidence_artifact_store.ts";

const FILE_SYSTEM_EVIDENCE_ARTIFACT_STORE: EvidenceArtifactStore = {
  async writeBytes(storageKey, bytes) {
    const safeStorageKey = assertEvidenceArtifactStorageKey(storageKey);
    const directory = safeStorageKey.split("/").slice(0, -1).join("/");

    await Deno.mkdir(directory, { recursive: true });
    await Deno.writeFile(safeStorageKey, bytes);
  },

  async readBytes(storageKey) {
    return await Deno.readFile(assertEvidenceArtifactStorageKey(storageKey));
  },
};

export function getDefaultEvidenceArtifactStore(): EvidenceArtifactStore {
  return FILE_SYSTEM_EVIDENCE_ARTIFACT_STORE;
}
