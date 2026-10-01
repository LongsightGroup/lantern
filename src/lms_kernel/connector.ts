import type { PrimitiveErrorCode, RosterRole } from '../../sdk/worker-app-sdk.ts';
import type { LanternLtiToolContext } from '../lti/tool_provider.ts';
import { requireVerifiedLtiSessionWithContext } from '../lti/session_boundary.ts';
import { parseLtiContextRole } from './context_roles.ts';
import type {
  GovernedRuntimeSession,
  RosterConnectorMember,
  RosterConnectorPage,
} from './types.ts';

export type RosterConnectorResult =
  | { readonly ok: true; readonly page: RosterConnectorPage }
  | {
    readonly ok: false;
    readonly errorCode: Extract<PrimitiveErrorCode, 'upstream_unavailable' | 'rate_limited'>;
  };

export interface RosterConnector {
  listPage(input: {
    readonly session: GovernedRuntimeSession;
    readonly continuation: string | null;
  }): Promise<RosterConnectorResult>;
}

export function createNrpsRosterConnector(
  getContext: () => Promise<LanternLtiToolContext>,
): RosterConnector {
  return {
    async listPage(input) {
      if (input.session.ltiToolSessionId === null) {
        return { ok: false, errorCode: 'upstream_unavailable' };
      }

      try {
        const verified = await requireVerifiedLtiSessionWithContext({
          getContext,
          sessionId: input.session.ltiToolSessionId,
          missingMessage: 'Verified LTI session is required for roster access.',
          notFoundMessage: 'Verified LTI session for roster access was not found.',
        });
        const verifiedNrps = verified.session.services?.nrps;
        if (
          verifiedNrps === undefined ||
          verifiedNrps.membershipUrl !== input.session.nrpsContextMembershipsUrl ||
          !sameStrings(verifiedNrps.versions, input.session.nrpsServiceVersions)
        ) {
          return { ok: false, errorCode: 'upstream_unavailable' };
        }
        const result = await verified.context.tool
          .createAdvantage(verified.session)
          .getMembersPage(input.continuation ?? undefined);

        if (!result.success) {
          const message = result.error.message.toLowerCase();
          return {
            ok: false,
            errorCode: message.includes('429') || message.includes('rate')
              ? 'rate_limited'
              : 'upstream_unavailable',
          };
        }

        return {
          ok: true,
          page: {
            members: result.data.members.map((member) => ({
              providerSubjectId: member.userId,
              displayName: member.name.trim() || 'Name unavailable',
              roles: normalizeRoles(member.roles),
              status: normalizeStatus(member.status),
              email: member.email ?? null,
              pictureUrl: member.picture ?? null,
            })),
            nextContinuation: result.data.nextUrl ?? null,
          },
        };
      } catch {
        return { ok: false, errorCode: 'upstream_unavailable' };
      }
    },
  };
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length &&
    [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

export function createSyntheticRosterConnector(): RosterConnector {
  const members = buildSyntheticMembers();
  const pageSize = 24;

  return {
    listPage(input) {
      const offset = parseSyntheticOffset(input.continuation);
      if (offset === null) {
        return Promise.resolve({ ok: false, errorCode: 'upstream_unavailable' });
      }
      const page = members.slice(offset, offset + pageSize);
      const nextOffset = offset + page.length;
      return Promise.resolve({
        ok: true,
        page: {
          members: page,
          nextContinuation: nextOffset < members.length ? String(nextOffset) : null,
        },
      });
    },
  };
}

function normalizeRoles(roles: readonly string[]): RosterRole[] {
  const normalized = new Set<RosterRole>();
  for (const role of roles) {
    normalized.add(parseLtiContextRole(role));
  }
  return normalized.size === 0 ? ['other'] : [...normalized];
}

function normalizeStatus(value: string): RosterConnectorMember['status'] {
  const status = value.toLowerCase();
  if (status === 'active') {
    return 'active';
  }
  if (status === 'inactive' || status === 'deleted') {
    return 'inactive';
  }
  return 'unknown';
}

function parseSyntheticOffset(value: string | null): number | null {
  if (value === null) {
    return 0;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function buildSyntheticMembers(): RosterConnectorMember[] {
  const firstNames = [
    'Avery',
    'Jordan',
    'Morgan',
    'Riley',
    'Cameron',
    'Taylor',
    'Casey',
    'Quinn',
  ];
  const lastNames = ['Allen', 'Brooks', 'Chen', 'Diaz', 'Evans', 'Foster', 'Gupta', 'Hall'];
  return Array.from({ length: 57 }, (_, index) => {
    const firstName = firstNames[index % firstNames.length]!;
    const lastName = lastNames[Math.floor(index / firstNames.length) % lastNames.length]!;
    const ordinal = index + 1;
    return {
      providerSubjectId: `synthetic-user-${ordinal}`,
      displayName: `${firstName} ${lastName}`,
      roles: index === 0 ? ['instructor'] : ['learner'],
      status: 'active',
      email: `${firstName}.${lastName}.${ordinal}@example.edu`.toLowerCase(),
      pictureUrl: null,
    };
  });
}
