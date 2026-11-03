import type { PackageReviewRepository } from '../package_review/repository.ts';
import type { LmsKernelRepository } from './repository.ts';
import type { InstitutionMembershipRecord, LmsConnectionRecord, LmsPlatformType } from './types.ts';
import { failure, type KernelAdminResult } from './admin_result.ts';
import { parseLmsOrigin } from './lms_origin.ts';

export interface KernelAdminDeps {
  readonly repository: LmsKernelRepository;
  readonly packageRepository: PackageReviewRepository;
  readonly createId: () => string;
  readonly createSecret: () => string;
  readonly now: () => Date;
  readonly syncLtiToolRegistration?: (connection: LmsConnectionRecord) => Promise<void>;
}

export function canGovern(membership: InstitutionMembershipRecord): boolean {
  return membership.role === 'owner' || membership.role === 'admin';
}

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function institutionSlug(name: string, suffix: string): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'institution';
  return `${base}-${suffix.replaceAll('-', '').slice(0, 8)}`;
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function parseConnectionFields(input: {
  readonly platformType: LmsPlatformType;
  readonly lmsOrigin?: string;
  readonly issuer?: string;
  readonly clientId?: string;
  readonly deploymentId?: string;
  readonly authorizationEndpoint?: string;
  readonly accessTokenUrl?: string;
  readonly jwksUrl?: string;
}): KernelAdminResult<{
  readonly lmsOrigin: string;
  readonly issuer: string;
  readonly clientId: string;
  readonly deploymentId: string;
  readonly authorizationEndpoint: string;
  readonly accessTokenUrl: string;
  readonly jwksUrl: string;
}> {
  if (input.platformType === 'synthetic') {
    return {
      ok: true,
      value: {
        lmsOrigin: 'https://synthetic.lantern.invalid',
        issuer: 'https://synthetic.lantern.invalid',
        clientId: `synthetic-${crypto.randomUUID()}`,
        deploymentId: `synthetic-${crypto.randomUUID()}`,
        authorizationEndpoint: 'https://synthetic.lantern.invalid/authorize',
        accessTokenUrl: 'https://synthetic.lantern.invalid/token',
        jwksUrl: 'https://synthetic.lantern.invalid/jwks',
      },
    };
  }
  const lmsOrigin = parseLmsOrigin(input.lmsOrigin ?? '');
  if (lmsOrigin === null) {
    return failure(
      'invalid_request',
      'Enter the HTTPS origin of the LMS course pages, without a path, query, or fragment.',
    );
  }
  const values = {
    lmsOrigin,
    issuer: input.issuer?.trim() ?? '',
    clientId: input.clientId?.trim() ?? '',
    deploymentId: input.deploymentId?.trim() ?? '',
    authorizationEndpoint: input.authorizationEndpoint?.trim() ?? '',
    accessTokenUrl: input.accessTokenUrl?.trim() ?? '',
    jwksUrl: input.jwksUrl?.trim() ?? '',
  };
  if (
    values.clientId === '' ||
    values.deploymentId === '' ||
    !isHttpsUrl(values.issuer) ||
    !isHttpsUrl(values.authorizationEndpoint) ||
    !isHttpsUrl(values.accessTokenUrl) ||
    !isHttpsUrl(values.jwksUrl)
  ) {
    return failure(
      'invalid_request',
      'Real LMS connections require an issuer, client ID, deployment ID, and HTTPS authorization, token, and JWKS URLs.',
    );
  }
  return { ok: true, value: values };
}
