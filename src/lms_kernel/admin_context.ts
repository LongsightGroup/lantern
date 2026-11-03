import type { Context } from 'hono';
import type { InstitutionMembershipRecord, InstitutionRecord } from './types.ts';

const KERNEL_ADMIN_CONTEXT = 'lmsKernelAdminContext';

export interface KernelAdminContext {
  readonly institution: InstitutionRecord;
  readonly membership: InstitutionMembershipRecord;
}

export function setKernelAdminContext(context: Context, value: KernelAdminContext): void {
  context.set(KERNEL_ADMIN_CONTEXT, value);
}

export function getKernelAdminContext(context: Context): KernelAdminContext {
  const value = context.get(KERNEL_ADMIN_CONTEXT);
  if (!isKernelAdminContext(value)) {
    throw new Error('Institution-scoped admin route reached without institution context.');
  }
  return value;
}

function isKernelAdminContext(value: unknown): value is KernelAdminContext {
  return (
    typeof value === 'object' && value !== null && 'institution' in value && 'membership' in value
  );
}
