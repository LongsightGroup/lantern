import type { PostgresError } from '@db/postgres';

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

export function isUniqueViolation(error: unknown): error is PostgresError {
  return (
    error instanceof Error &&
    error.name === 'PostgresError' &&
    'fields' in error &&
    typeof (error as { fields?: { code?: string } }).fields?.code === 'string' &&
    (error as { fields: { code: string } }).fields.code === '23505'
  );
}
