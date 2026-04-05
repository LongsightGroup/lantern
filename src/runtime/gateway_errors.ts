import type { Capability } from "../../sdk/app-sdk.ts";
import type {
  RuntimeBrokerDenial,
  RuntimeBrokerDeniedResult,
  RuntimeDetailValue,
  RuntimeOutcome,
} from "./gateway_types.ts";

export class RuntimeBrokerDenialError extends Error {
  readonly denial: RuntimeBrokerDenial;
  readonly status: 400 | 409;

  constructor(denial: RuntimeBrokerDenial) {
    super(denial.message);
    this.name = "RuntimeBrokerDenialError";
    this.denial = denial;
    this.status = denial.category === "policyDenied" ? 409 : 400;
  }

  get category(): RuntimeBrokerDenial["category"] {
    return this.denial.category;
  }

  get code(): string {
    return this.denial.code;
  }

  get capability(): Capability | null {
    return this.denial.capability;
  }

  get detail(): RuntimeBrokerDenial["detail"] {
    return this.denial.detail;
  }
}

export class RuntimeOutcomeError extends Error {
  readonly outcome: RuntimeOutcome;

  constructor(outcome: RuntimeOutcome) {
    super(outcome.message);
    this.name = "RuntimeOutcomeError";
    this.outcome = outcome;
  }

  get type(): RuntimeOutcome["type"] {
    return this.outcome.type;
  }

  get code(): string {
    return this.outcome.code;
  }

  get detail(): RuntimeOutcome["detail"] {
    return this.outcome.detail;
  }

  get status(): RuntimeOutcome["status"] {
    return this.outcome.status;
  }
}

export function buildRuntimeDetailRecord(
  detail: Record<string, RuntimeDetailValue | undefined>,
): Record<string, RuntimeDetailValue> {
  const normalized: Record<string, RuntimeDetailValue> = {};

  for (const [key, value] of Object.entries(detail)) {
    if (value !== undefined) {
      normalized[key] = value;
    }
  }

  return normalized;
}

export function denyRuntimeBroker(input: {
  category: RuntimeBrokerDenial["category"];
  code: string;
  message: string;
  capability?: Capability | null;
  detail?: Record<string, RuntimeDetailValue | undefined>;
}): never {
  throw new RuntimeBrokerDenialError({
    category: input.category,
    code: input.code,
    message: input.message,
    capability: input.capability ?? null,
    detail: buildRuntimeDetailRecord(input.detail ?? {}),
  });
}

export function failRuntimeOutcome(input: {
  type: RuntimeOutcome["type"];
  code: string;
  message: string;
  status: RuntimeOutcome["status"];
  detail?: Record<string, RuntimeDetailValue | undefined>;
}): never {
  throw new RuntimeOutcomeError({
    type: input.type,
    code: input.code,
    message: input.message,
    status: input.status,
    detail: buildRuntimeDetailRecord(input.detail ?? {}),
  });
}

export function isRuntimeBrokerDenialError(
  error: unknown,
): error is RuntimeBrokerDenialError {
  return error instanceof RuntimeBrokerDenialError;
}

export function isRuntimeOutcomeError(
  error: unknown,
): error is RuntimeOutcomeError {
  return error instanceof RuntimeOutcomeError;
}

export function toRuntimeBrokerResult(
  error: unknown,
): RuntimeBrokerDeniedResult | null {
  if (!isRuntimeBrokerDenialError(error)) {
    return null;
  }

  return {
    accepted: false,
    denial: error.denial,
  };
}

export function toFinalizeError(error: unknown): Error {
  if (isRuntimeBrokerDenialError(error) || isRuntimeOutcomeError(error)) {
    return error;
  }

  if (error instanceof Error && error.message.startsWith("Finalize ")) {
    return new RuntimeBrokerDenialError({
      category: "policyDenied",
      code: "finalize_blocked",
      message: error.message,
      capability: "finalize_attempt",
      detail: {},
    });
  }

  return new RuntimeBrokerDenialError({
    category: "policyDenied",
    code: "finalize_blocked",
    message: `Finalize blocked: ${errorMessage(error)}`,
    capability: "finalize_attempt",
    detail: {},
  });
}

export function errorMessage(error: unknown): string {
  if (isRuntimeBrokerDenialError(error) || isRuntimeOutcomeError(error)) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Unknown finalize error.";
}
