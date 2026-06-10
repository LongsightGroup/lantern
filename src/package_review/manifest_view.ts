export function readUnknownRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function readUnknownString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function readManifestRecord(
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  return readUnknownRecord(record[key]) ?? {};
}

export function readManifestString(record: Record<string, unknown>, key: string): string | null {
  return readUnknownString(record[key]);
}

export function readManifestStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];

  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
