import type { Context } from 'hono';
import type { AdminIdentity } from '../admin/layout_support.ts';
import { adminIdentityFromContext } from './context.ts';

export const ADMIN_TEST_IDENTITY: AdminIdentity = {
  displayName: 'Test Admin',
  detail: 'admin@example.test',
};

export function adminPageInput<T extends Record<string, unknown>>(
  context: Context,
  input: T,
): T & { identity: AdminIdentity } {
  return {
    ...input,
    identity: adminIdentityFromContext(context),
  };
}

export function adminPageInputWithIdentity<T extends Record<string, unknown>>(
  identity: AdminIdentity,
  input: T,
): T & { identity: AdminIdentity } {
  return {
    ...input,
    identity,
  };
}
