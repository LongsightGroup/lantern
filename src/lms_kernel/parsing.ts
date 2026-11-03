import type { RosterListInput } from '../../sdk/worker-app-sdk.ts';

export type RosterListInputParseResult =
  | { readonly ok: true; readonly value: RosterListInput }
  | { readonly ok: false };

export function parseRosterListInput(value: unknown): RosterListInputParseResult {
  if (!isRecord(value) || !Array.isArray(value.fields)) {
    return { ok: false };
  }

  const fields: Array<'email' | 'photo'> = [];
  for (const field of value.fields) {
    if (field !== 'email' && field !== 'photo') {
      return { ok: false };
    }
    if (!fields.includes(field)) {
      fields.push(field);
    }
  }

  if (
    value.cursor !== undefined &&
    (typeof value.cursor !== 'string' || value.cursor.length === 0)
  ) {
    return { ok: false };
  }

  const allowedKeys = new Set(['fields', 'cursor']);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    return { ok: false };
  }

  return {
    ok: true,
    value: value.cursor === undefined ? { fields } : { fields, cursor: value.cursor },
  };
}

export function parseStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${fieldName} must be an array of strings.`);
  }

  return [...value];
}

export function parseJsonObject(value: unknown, fieldName: string): Record<string, string> {
  if (!isRecord(value)) {
    throw new Error(`${fieldName} must be an object.`);
  }

  const parsed: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'string') {
      throw new Error(`${fieldName} values must be strings.`);
    }
    parsed[key] = item;
  }

  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
