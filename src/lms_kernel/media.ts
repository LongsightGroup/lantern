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
        const contentType =
          upstream.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
        const body = upstream.ok ? await readRasterImage(upstream, contentType) : null;
        if (body === null) {
          await upstream.body?.cancel();
          await recordMediaEvent(input.repository, reference, 'failed', 'upstream_unavailable');
          return mediaResponse('Profile photo is unavailable.', 502);
        }
        await recordMediaEvent(input.repository, reference, 'completed', null);
        return new Response(body, {
          status: 200,
          headers: mediaHeaders(contentType),
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
    'x-content-type-options': 'nosniff',
    'content-security-policy':
      "sandbox; default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'cross-origin-resource-policy': 'same-origin',
  };
}

async function readRasterImage(
  response: Response,
  contentType: string,
): Promise<ReadableStream<Uint8Array> | null> {
  if (
    !['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(contentType) ||
    response.body === null
  ) {
    return null;
  }
  const reader = response.body.getReader();
  const prefix = new Uint8Array(12);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (length < prefix.length) {
      const part = await reader.read();
      if (part.done) break;
      chunks.push(part.value);
      const copied = part.value.subarray(0, prefix.length - length);
      prefix.set(copied, length);
      length += copied.length;
    }
    if (!matchesRasterSignature(prefix.subarray(0, length), contentType)) {
      await reader.cancel();
      reader.releaseLock();
      return null;
    }
  } catch (cause: unknown) {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
    throw cause;
  }
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const chunk = chunks.shift();
      if (chunk !== undefined) {
        controller.enqueue(chunk);
        return;
      }
      try {
        const part = await reader.read();
        if (part.done) {
          reader.releaseLock();
          controller.close();
        } else {
          controller.enqueue(part.value);
        }
      } catch (cause: unknown) {
        reader.releaseLock();
        controller.error(cause);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
      reader.releaseLock();
    },
  });
}

function matchesRasterSignature(bytes: Uint8Array, contentType: string): boolean {
  const startsWith = (signature: readonly number[]): boolean =>
    signature.every((byte, index) => bytes[index] === byte);
  switch (contentType) {
    case 'image/png':
      return startsWith([137, 80, 78, 71, 13, 10, 26, 10]);
    case 'image/jpeg':
      return startsWith([255, 216, 255]);
    case 'image/gif':
      return startsWith([71, 73, 70, 56]) &&
        (bytes[4] === 55 || bytes[4] === 57) && bytes[5] === 97;
    case 'image/webp':
      return startsWith([82, 73, 70, 70]) &&
        bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80;
    default:
      return false;
  }
}
