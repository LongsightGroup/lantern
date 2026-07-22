export type KernelAdminFailureCode =
  | 'invalid_request'
  | 'permission_denied'
  | 'not_found'
  | 'approval_incomplete';

export type KernelAdminResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
    readonly ok: false;
    readonly error: {
      readonly code: KernelAdminFailureCode;
      readonly message: string;
    };
  };

export function failure<T>(
  code: KernelAdminFailureCode,
  message: string,
): KernelAdminResult<T> {
  return { ok: false, error: { code, message } };
}
