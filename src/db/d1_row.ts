export function parseD1JsonField<T>(
  value: unknown,
  fieldName: string,
  parse: (value: unknown, fieldName: string) => T,
): T {
  if (typeof value !== 'string') {
    throw new TypeError(`Expected D1 ${fieldName} to be JSON text.`);
  }

  return parse(JSON.parse(value), fieldName);
}

export function parseD1NullableJsonField<T>(
  value: unknown,
  fieldName: string,
  parse: (value: unknown, fieldName: string) => T,
): T | null {
  if (value === null) {
    return null;
  }

  return parseD1JsonField(value, fieldName, parse);
}

export function expectD1String(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`Expected D1 ${fieldName} to be text.`);
  }

  return value;
}

export function expectD1NullableString(value: unknown, fieldName: string): string | null {
  if (value === null) {
    return null;
  }

  return expectD1String(value, fieldName);
}

export function expectD1Number(value: unknown, fieldName: string): number {
  if (typeof value !== 'number') {
    throw new TypeError(`Expected D1 ${fieldName} to be numeric.`);
  }

  return value;
}

export function expectD1NullableNumber(value: unknown, fieldName: string): number | null {
  if (value === null) {
    return null;
  }

  return expectD1Number(value, fieldName);
}

export function expectD1StringLiteral<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[],
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`Unexpected D1 ${fieldName} value.`);
  }

  // SAFETY: The includes check above proves value is one of the allowed literals.
  return value as T;
}

export function expectD1NullableStringLiteral<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[],
): T | null {
  if (value === null) {
    return null;
  }

  return expectD1StringLiteral(value, fieldName, allowed);
}

export function expectD1JsonRecord(
  value: unknown,
  fieldName: string,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`Expected D1 ${fieldName} JSON to be an object.`);
  }

  return Object.fromEntries(Object.entries(value));
}

export function expectD1StringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new TypeError(`Expected D1 ${fieldName} JSON to be a text array.`);
  }

  return value;
}
