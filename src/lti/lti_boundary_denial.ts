export type LtiBoundaryDenialCategory = 'specInvalid' | 'policyDenied';

export interface LtiBoundaryDenial {
  category: LtiBoundaryDenialCategory;
  code: string;
  message: string;
  detail: Record<string, string | null>;
}

export class LtiBoundaryDenialError extends Error {
  readonly denial: LtiBoundaryDenial;

  constructor(denial: LtiBoundaryDenial) {
    super(denial.message);
    this.name = 'LtiBoundaryDenialError';
    this.denial = denial;
  }

  get category(): LtiBoundaryDenialCategory {
    return this.denial.category;
  }

  get code(): string {
    return this.denial.code;
  }

  get detail(): Record<string, string | null> {
    return this.denial.detail;
  }
}

export function isLtiBoundaryDenialError(error: unknown): error is LtiBoundaryDenialError {
  return error instanceof LtiBoundaryDenialError;
}

export function buildRejectionDetailRecord(
  detail: Record<string, string | number | null | undefined>,
): Record<string, string | null> {
  const normalized: Record<string, string | null> = {};

  for (const [key, value] of Object.entries(detail)) {
    normalized[key] = value === undefined || value === null ? null : String(value);
  }

  return normalized;
}

export const buildLaunchDetailRecord = buildRejectionDetailRecord;
