export type RosterCapability =
  | 'lms.roster.members.read'
  | 'lms.roster.contact.read'
  | 'lms.roster.profile_photo.read';

export type RosterRole = 'learner' | 'instructor' | 'administrator' | 'other';

export interface RosterListInput {
  readonly fields: readonly ('email' | 'photo')[];
  readonly cursor?: string;
}

export interface RosterMember {
  readonly subjectId: string;
  readonly displayName: string;
  readonly roles: readonly RosterRole[];
  readonly status: 'active' | 'inactive' | 'unknown';
  readonly email?: string;
  readonly photo?: {
    readonly url: string;
    readonly expiresAt: string;
  };
}

export interface RosterPage {
  readonly members: readonly RosterMember[];
  readonly nextCursor?: string;
  readonly observedAt: string;
}

export type PrimitiveErrorCode =
  | 'invalid_request'
  | 'permission_denied'
  | 'session_expired'
  | 'upstream_unavailable'
  | 'rate_limited';

export type PrimitiveResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: PrimitiveErrorCode;
        readonly traceId: string;
      };
    };

export interface LanternLmsBinding {
  listRoster(input: RosterListInput): Promise<PrimitiveResult<RosterPage>>;
}

export interface LanternLmsCapabilityBinding {
  listRoster(input: {
    readonly runtimeSessionId: string;
    readonly runtimeSessionToken: string;
    readonly traceId?: string;
    readonly request: RosterListInput;
  }): Promise<PrimitiveResult<RosterPage>>;
}

/** Builds a same-session page URL using the gateway-owned navigation base. */
export function createLanternRuntimePageUrl(request: Request, cursor: string): string | null {
  const base = request.headers.get('x-lantern-runtime-page-url');
  if (base === null) return null;
  const url = new URL(base, 'https://reviewed-app.internal');
  url.searchParams.set('cursor', cursor);
  return `${url.pathname}${url.search}`;
}

export function createLanternLmsClient(input: {
  readonly request: Request;
  readonly binding: LanternLmsCapabilityBinding;
}): LanternLmsBinding {
  const runtimeSessionId = input.request.headers.get('x-lantern-runtime-session-id');
  const runtimeSessionToken = input.request.headers.get('x-lantern-runtime-session-token');
  const traceId = input.request.headers.get('x-lantern-trace-id');

  return {
    listRoster(request) {
      if (!runtimeSessionId || !runtimeSessionToken) {
        return Promise.resolve({
          ok: false,
          error: {
            code: 'session_expired',
            traceId: crypto.randomUUID(),
          },
        });
      }
      return input.binding.listRoster({
        runtimeSessionId,
        runtimeSessionToken,
        ...(traceId === null ? {} : { traceId }),
        request,
      });
    },
  };
}
