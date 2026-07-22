import type { LmsKernelRepository, ProtectedMediaReference } from './repository.ts';

export interface ProtectedMediaService {
  fetch(input: {
    readonly mediaId: string;
    readonly now: Date;
  }): Promise<Response>;
}

export function createProtectedMediaService(input: {
  readonly repository: LmsKernelRepository;
  readonly fetchUpstream?: typeof fetch;
}): ProtectedMediaService {
  const fetchUpstream = input.fetchUpstream ?? fetch;
  return {
    async fetch(command) {
      const reference = await input.repository.getAuthorizedProtectedMediaReference({
        id: command.mediaId,
        now: command.now.toISOString(),
      });
      if (reference === null) {
        return mediaResponse('Profile photo link expired.', 404);
      }

      let source: URL;
      try {
        source = new URL(reference.sourceUrl);
      } catch {
        await recordMediaEvent(input.repository, reference, 'failed', 'upstream_unavailable');
        return mediaResponse('Profile photo is unavailable.', 502);
      }
      if (source.protocol !== 'https:') {
        return mediaResponse('Profile photo is unavailable.', 502);
      }

      try {
        const upstream = await fetchUpstream(source, {
          redirect: 'follow',
          headers: { accept: 'image/*' },
        });
        if (!upstream.ok || !isImageContentType(upstream.headers.get('content-type'))) {
          await recordMediaEvent(input.repository, reference, 'failed', 'upstream_unavailable');
          return mediaResponse('Profile photo is unavailable.', 502);
        }
        await recordMediaEvent(input.repository, reference, 'completed', null);
        return new Response(upstream.body, {
          status: 200,
          headers: mediaHeaders(upstream.headers.get('content-type')!),
        });
      } catch {
        await recordMediaEvent(input.repository, reference, 'failed', 'upstream_unavailable');
        return mediaResponse('Profile photo is unavailable.', 502);
      }
    },
  };
}

async function recordMediaEvent(
  repository: LmsKernelRepository,
  reference: ProtectedMediaReference,
  outcome: 'completed' | 'failed',
  errorCode: string | null,
): Promise<void> {
  await repository.appendGovernanceEvent({
    traceId: reference.traceId,
    eventType: 'protected_media.fetch',
    institutionId: reference.institutionId,
    lmsConnectionId: reference.lmsConnectionId,
    lmsContextId: reference.lmsContextId,
    appInstallationId: reference.appInstallationId,
    appId: null,
    packageVersionId: reference.packageVersionId,
    runtimeSessionId: reference.runtimeSessionId,
    actorType: reference.actorType,
    actorId: reference.actorSubjectId,
    capability: 'lms.roster.profile_photo.read',
    capabilityGrantId: null,
    decision: outcome === 'completed' ? 'allowed' : 'denied',
    outcome,
    connectorKind: reference.connectorKind,
    objectCount: outcome === 'completed' ? 1 : null,
    latencyMs: null,
    errorCode,
    requestMetadata: {},
    occurredAt: new Date().toISOString(),
  });
}

function mediaResponse(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      ...mediaHeaders('text/plain; charset=UTF-8'),
      'x-content-type-options': 'nosniff',
    },
  });
}

function mediaHeaders(contentType: string): Record<string, string> {
  return {
    'content-type': contentType,
    'cache-control': 'private, no-store',
    'referrer-policy': 'no-referrer',
  };
}

function isImageContentType(value: string | null): value is string {
  return value !== null && value.toLowerCase().startsWith('image/');
}
