import { isRuntimeBrokerDenialError, isRuntimeOutcomeError } from './runtime/gateway_errors.ts';

export function statusForError(error: unknown): 409 | 500 {
  if (!(error instanceof Error)) {
    return 500;
  }

  const loweredMessage = error.message.toLowerCase();

  if (error.message === 'APP_RUNTIME_ORIGIN is required to serve reviewed runtime sessions.') {
    return 500;
  }

  if (
    error.message.includes('already exists') ||
    error.message.includes('cannot change state') ||
    error.message.includes('Only approved') ||
    error.message.includes('does not belong') ||
    error.message.includes('Unsupported LTI ') ||
    error.message.includes('not found') ||
    error.message.includes('required') ||
    error.message.includes('Choose ') ||
    error.message.includes('must send client_id') ||
    error.message.includes('already been used') ||
    error.message.includes('has expired') ||
    error.message.includes('Login state') ||
    error.message.includes('Launch ') ||
    error.message.includes('Preview ') ||
    loweredMessage.includes('test launch')
  ) {
    return 409;
  }

  return 500;
}

export function statusForRuntimeError(error: unknown): 400 | 404 | 409 | 500 {
  if (isRuntimeBrokerDenialError(error)) {
    return error.status;
  }

  if (isRuntimeOutcomeError(error)) {
    return error.status;
  }

  if (!(error instanceof Error)) {
    return 500;
  }

  if (error.message === 'APP_RUNTIME_ORIGIN is required to serve reviewed runtime sessions.') {
    return 500;
  }

  if (error.message.includes('was not found')) {
    return 404;
  }

  if (
    error.message.includes('Runtime session') ||
    error.message.includes('Runtime file') ||
    error.message.includes('required') ||
    error.message.includes('Attempt ') ||
    error.message.includes('Unsupported attempt event') ||
    error.message.includes('does not allow') ||
    error.message.includes('Finalize ')
  ) {
    return 409;
  }

  return 500;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Lantern hit an unexpected error.';
}
