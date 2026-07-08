import type { LTISession } from '@longsightgroup/lti-tool';
import type { LanternLtiToolContext } from '../lti/tool_provider.ts';
import { buildTestLtiJwtPayload } from './lti_session_builders.ts';

export interface TestLtiToolContextInput {
  sessionId?: string;
  lineItemUrl?: string;
  members?: unknown[];
  submitScoreSuccess?: boolean;
  submitScoreMessage?: string;
}

export interface TestLtiToolContext {
  context: LanternLtiToolContext;
  submittedScores: unknown[];
  lineItemRequests: unknown[];
}

export function createTestLtiToolContext(
  input: TestLtiToolContextInput = {},
): TestLtiToolContext {
  const submittedScores: unknown[] = [];
  const lineItemRequests: unknown[] = [];
  const session = buildTestLtiSession({
    sessionId: input.sessionId ?? 'lti-tool-session-123',
  });

  const context = {
    storage: {
      getSession: (sessionId: string) =>
        Promise.resolve(sessionId === session.id ? session : undefined),
    },
    tool: {
      createAdvantage: () => ({
        findOrCreateLineItem: (request: unknown) => {
          lineItemRequests.push(request);

          return Promise.resolve({
            success: true,
            data: {
              id: input.lineItemUrl ?? 'https://canvas.example/api/lti/courses/42/line_items/9',
              label: 'Chapter 4 Asteroids Final Grade',
              scoreMaximum: 100,
              resourceId: readRequestString(request, 'resourceId'),
              tag: readRequestString(request, 'tag'),
            },
          });
        },
        submitScore: (score: unknown) => {
          submittedScores.push(score);

          return Promise.resolve(
            input.submitScoreSuccess === false
              ? {
                success: false,
                error: {
                  message: input.submitScoreMessage ?? 'score publish failed',
                  code: 'score_publish_failed',
                  serviceKind: 'ags',
                  operation: 'submitScore',
                },
              }
              : {
                success: true,
                data: undefined,
              },
          );
        },
        getMembers: () =>
          Promise.resolve({
            success: true,
            data: {
              members: input.members ?? [{ userId: 'learner-1' }, { userId: 'learner-2' }],
              pagination: {
                pagesFetched: 1,
                truncated: false,
              },
            },
          }),
      }),
    },
    dynamicRegistration: {},
    logger: {},
  } as unknown as LanternLtiToolContext;

  return {
    context,
    submittedScores,
    lineItemRequests,
  };
}

function buildTestLtiSession(input: { sessionId: string }): LTISession {
  return {
    id: input.sessionId,
    jwtPayload: buildTestLtiJwtPayload(),
    user: {
      id: 'canvas-user-123',
      roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
    },
    context: {
      id: 'course-42',
      label: 'Physics 101',
      title: 'Physics 101',
    },
    platform: {
      issuer: 'https://canvas.instructure.com',
      clientId: '10000000000001',
      deploymentId: 'deployment-123',
      name: 'Canvas',
    },
    launch: {
      target: 'http://localhost:8417/lti/launch',
    },
    resourceLink: {
      id: 'resource-link-123',
      title: 'Chapter 4 Asteroids',
    },
    services: {
      ags: {
        lineitems: 'https://canvas.example/api/lti/courses/42/line_items',
        scopes: [
          'https://purl.imsglobal.org/spec/lti-ags/scope/score',
          'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
        ],
      },
      nrps: {
        membershipUrl: 'https://canvas.example/api/lti/courses/42/names_and_roles',
        versions: ['2.0'],
      },
    },
    customParameters: {},
    isAdmin: false,
    isInstructor: false,
    isStudent: true,
    isAssignmentAndGradesAvailable: true,
    isDeepLinkingAvailable: false,
    isNameAndRolesAvailable: true,
  };
}

function readRequestString(request: unknown, key: string): string | undefined {
  if (typeof request !== 'object' || request === null || !(key in request)) {
    return undefined;
  }

  const value = (request as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}
