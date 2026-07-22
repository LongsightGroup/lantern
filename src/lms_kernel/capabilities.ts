import type { RosterCapability } from '../../sdk/worker-app-sdk.ts';

export const ROSTER_CAPABILITIES = [
  'lms.roster.members.read',
  'lms.roster.contact.read',
  'lms.roster.profile_photo.read',
] as const satisfies readonly RosterCapability[];

export function isRosterCapability(value: string): value is RosterCapability {
  return (ROSTER_CAPABILITIES as readonly string[]).includes(value);
}

export function parseRosterCapability(value: string): RosterCapability | null {
  return isRosterCapability(value) ? value : null;
}

export function requireRosterCapability(value: unknown, field = 'capability'): RosterCapability {
  if (typeof value !== 'string' || !isRosterCapability(value)) {
    throw new Error(`${field} used an unsupported value.`);
  }
  return value;
}
