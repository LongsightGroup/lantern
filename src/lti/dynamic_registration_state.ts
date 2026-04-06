import type { PackageReviewRepository } from '../package_review/repository.ts';
import { createOpaqueToken } from './token_support.ts';
import type { DynamicRegistrationStateRecord, LmsType } from './types.ts';

const DYNAMIC_REGISTRATION_STATE_TTL_MS = 30 * 60 * 1000;

export async function createDynamicRegistrationState(input: {
  repository: PackageReviewRepository;
  appId: string;
  lms: LmsType;
  now?: () => Date;
  createOpaqueToken?: () => string;
}): Promise<DynamicRegistrationStateRecord> {
  const now = input.now ?? (() => new Date());
  const nextOpaqueToken = input.createOpaqueToken ?? createOpaqueToken;
  const createdAt = now();

  return await input.repository.createDynamicRegistrationState({
    state: nextOpaqueToken(),
    appId: input.appId,
    lms: input.lms,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + DYNAMIC_REGISTRATION_STATE_TTL_MS).toISOString(),
    usedAt: null,
  });
}

export async function consumeDynamicRegistrationState(input: {
  repository: PackageReviewRepository;
  state: string;
  appId: string;
  lms: LmsType;
  now?: () => Date;
}): Promise<DynamicRegistrationStateRecord> {
  const now = input.now ?? (() => new Date());
  const state = requireTrimmedValue(
    input.state,
    'Dynamic registration state is required. Start again from Lantern app settings.',
  );
  const existing = await input.repository.getDynamicRegistrationStateByState(state);

  if (!existing) {
    throw new Error(
      'Lantern could not verify this dynamic registration link. Start again from Lantern app settings.',
    );
  }

  if (existing.appId !== input.appId || existing.lms !== input.lms) {
    throw new Error(
      'This dynamic registration link does not match the requested LMS setup. Start again from Lantern app settings.',
    );
  }

  if (existing.usedAt !== null) {
    throw new Error(
      'This dynamic registration link has already been used. Start again from Lantern app settings.',
    );
  }

  if (Date.parse(existing.expiresAt) <= now().getTime()) {
    throw new Error(
      'This dynamic registration link has expired. Start again from Lantern app settings.',
    );
  }

  return await input.repository.consumeDynamicRegistrationState({
    state,
    usedAt: now().toISOString(),
  });
}

function requireTrimmedValue(value: string, message: string): string {
  const trimmed = value.trim();

  if (trimmed === '') {
    throw new Error(message);
  }

  return trimmed;
}
