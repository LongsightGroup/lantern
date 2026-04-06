import type { RuntimeOutcome } from './gateway_types.ts';

export class RuntimeOutcomeError extends Error {
  readonly outcome: RuntimeOutcome;

  constructor(outcome: RuntimeOutcome) {
    super(outcome.message);
    this.name = 'RuntimeOutcomeError';
    this.outcome = outcome;
  }

  get type(): RuntimeOutcome['type'] {
    return this.outcome.type;
  }

  get code(): string {
    return this.outcome.code;
  }

  get detail(): RuntimeOutcome['detail'] {
    return this.outcome.detail;
  }

  get status(): RuntimeOutcome['status'] {
    return this.outcome.status;
  }
}

export function isRuntimeOutcomeError(error: unknown): error is RuntimeOutcomeError {
  return error instanceof RuntimeOutcomeError;
}
