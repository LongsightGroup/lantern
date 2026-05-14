export function normalizeTimestamp(value: Date | string | null): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value === null) {
    throw new Error('Expected a timestamp value.');
  }

  return value;
}

export function normalizeOptionalTimestamp(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }

  return normalizeTimestamp(value);
}

export function normalizeNumeric(value: number | string): number {
  if (typeof value === 'number') {
    return value;
  }

  return Number(value);
}
