import type { UserRole } from '../../sdk/app-sdk.ts';

export function validateLtiAudience(input: {
  aud: string | string[] | undefined;
  azp: unknown;
  clientId: string;
  subject: string;
}): void {
  const audiences = Array.isArray(input.aud) ? input.aud : input.aud ? [input.aud] : [];

  if (!audiences.includes(input.clientId)) {
    throw new Error(`${input.subject} audience did not include client_id ${input.clientId}.`);
  }

  const authorizedParty = optionalStringClaim(input.azp);

  if (authorizedParty !== null && authorizedParty !== input.clientId) {
    throw new Error(`${input.subject} azp did not match client_id ${input.clientId}.`);
  }

  if (audiences.length > 1 && authorizedParty === null) {
    throw new Error(`${input.subject} azp is required when aud has multiple values.`);
  }
}

export function resolveUserRole(value: unknown): UserRole {
  if (!Array.isArray(value)) {
    return 'learner';
  }

  const roles = value.filter((item): item is string => typeof item === 'string');

  if (roles.some((role) => role.includes('#Instructor'))) {
    return 'instructor';
  }

  return 'learner';
}

export function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const items = value.filter((item): item is string => typeof item === 'string');

  return items.map((item) => item.trim()).filter((item) => item !== '');
}

export function requireRecordClaim(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(message);
  }

  return value as Record<string, unknown>;
}

export function optionalRecordClaim(
  value: unknown,
  message: string,
): Record<string, unknown> | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(message);
  }

  return value as Record<string, unknown>;
}

export function requireStringClaim(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(message);
  }

  return value.trim();
}

export function optionalTypedStringClaim(value: unknown, message: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new TypeError(message);
  }

  const trimmed = value.trim();

  return trimmed === '' ? null : trimmed;
}

export function optionalStringClaim(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === '' ? null : trimmed;
}

export function requireOptionalBooleanClaim(
  value: unknown,
  message: string,
  fallback: boolean,
): boolean {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value !== 'boolean') {
    throw new TypeError(message);
  }

  return value;
}

export function requireTrimmedValue(value: string, message: string): string {
  const trimmed = value.trim();

  if (trimmed === '') {
    throw new Error(message);
  }

  return trimmed;
}
