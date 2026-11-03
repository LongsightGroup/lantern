import { CompactSign, compactVerify, createLocalJWKSet } from 'jose';
import { getPublicJwkSet, loadToolSigningKey } from '../lti/tool_key.ts';
import type { EnvReader } from '../platform/env.ts';
import type { ConnectorKind } from './types.ts';

const CURSOR_TYPE = 'application/lantern-roster-cursor+jws';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface RosterCursorPayload {
  readonly continuationId: string;
  readonly runtimeSessionId: string;
  readonly lmsContextId: string;
  readonly appInstallationId: string;
  readonly packageVersionId: number;
  readonly connectorKind: ConnectorKind;
  readonly expiresAt: string;
}

export type CursorVerificationResult =
  | { readonly ok: true; readonly payload: RosterCursorPayload }
  | { readonly ok: false };

export async function signRosterCursor(input: {
  readonly payload: RosterCursorPayload;
  readonly env: EnvReader;
}): Promise<string> {
  const signingKey = await loadToolSigningKey(input.env);
  return await new CompactSign(encoder.encode(serializeCursor(input.payload)))
    .setProtectedHeader({
      alg: signingKey.alg,
      kid: signingKey.keyId,
      typ: CURSOR_TYPE,
    })
    .sign(signingKey.privateKey);
}

export async function verifyRosterCursor(input: {
  readonly cursor: string;
  readonly env: EnvReader;
  readonly now: Date;
}): Promise<CursorVerificationResult> {
  try {
    const verified = await compactVerify(
      input.cursor,
      createLocalJWKSet(await getPublicJwkSet(input.env)),
    );
    if (verified.protectedHeader.typ !== CURSOR_TYPE) {
      return { ok: false };
    }
    const payload = parseCursor(JSON.parse(decoder.decode(verified.payload)));
    if (Date.parse(payload.expiresAt) <= input.now.getTime()) {
      return { ok: false };
    }
    return { ok: true, payload };
  } catch {
    return { ok: false };
  }
}

function serializeCursor(payload: RosterCursorPayload): string {
  return JSON.stringify({
    continuationId: payload.continuationId,
    runtimeSessionId: payload.runtimeSessionId,
    lmsContextId: payload.lmsContextId,
    appInstallationId: payload.appInstallationId,
    packageVersionId: payload.packageVersionId,
    connectorKind: payload.connectorKind,
    expiresAt: payload.expiresAt,
  });
}

function parseCursor(value: unknown): RosterCursorPayload {
  if (!isRecord(value)) {
    throw new Error('Roster cursor payload must be an object.');
  }
  return {
    continuationId: requireString(value, 'continuationId'),
    runtimeSessionId: requireString(value, 'runtimeSessionId'),
    lmsContextId: requireString(value, 'lmsContextId'),
    appInstallationId: requireString(value, 'appInstallationId'),
    packageVersionId: requireInteger(value, 'packageVersionId'),
    connectorKind: requireConnectorKind(value.connectorKind),
    expiresAt: requireString(value, 'expiresAt'),
  };
}

function requireConnectorKind(value: unknown): ConnectorKind {
  if (value !== 'nrps' && value !== 'synthetic') {
    throw new Error('Roster cursor connectorKind is unsupported.');
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: Record<string, unknown>, field: string): string {
  const item = value[field];
  if (typeof item !== 'string' || item.length === 0) {
    throw new Error(`Roster cursor ${field} must be a non-empty string.`);
  }
  return item;
}

function requireInteger(value: Record<string, unknown>, field: string): number {
  const item = value[field];
  if (typeof item !== 'number' || !Number.isSafeInteger(item)) {
    throw new Error(`Roster cursor ${field} must be an integer.`);
  }
  return item;
}
