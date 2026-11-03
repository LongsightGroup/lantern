import type { Context, Hono } from 'hono';
import { readEnv } from './platform/env.ts';
import type { AppServices } from './app_services.ts';

type PythonLabRouteServices = Pick<
  AppServices,
  | 'env'
  | 'getRepository'
  | 'pythonGraderSandboxFactory'
  | 'pythonLabArtifactStore'
  | 'pythonLabGenerationScheduler'
  | 'pythonLabHumanVerifier'
  | 'pythonLabRepository'
  | 'runtimeArtifactStore'
>;
import type { PythonLabRecord } from './python_lab/repository.ts';
import { buildPythonLabPrivateArtifactKey } from './python_lab/artifact_store.ts';
import { verifyPythonLabCandidate } from './python_lab/lab_service.ts';
import { launchPreviewRuntimeSession } from './preview/service.ts';
import { buildRuntimeSessionUrl, requireConfiguredRuntimeOrigin } from './runtime_origin.ts';
import {
  escapeHtml,
  LAB_PATH,
  labUrl,
  renderCandidatePage,
  renderLabCreateForm,
  renderLabStatus,
  renderPythonLabPage,
} from './python_lab/views.ts';
import {
  appendCookie,
  hashToken,
  labCookieName,
  randomToken,
  readCookie,
  timingSafeEqual,
} from './python_lab/access.ts';
import {
  formValue,
  readBoundedLabForm,
  requireFormText,
  requireFunctionName,
  requireWorkEmail,
} from './python_lab/forms.ts';

const LAB_TRIAL_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const LAB_REQUEST_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const IP_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

export function registerPythonLabRoutes(app: Hono, services: PythonLabRouteServices): void {
  app.get(LAB_PATH, (context) => {
    return context.html(
      renderPythonLabPage({
        title: 'Lantern Python Autograder Lab',
        heading: 'Create a gradeable Python assignment',
        body: renderLabCreateForm(readEnv('AUTOGRADER_TURNSTILE_SITE_KEY', services.env) ?? ''),
      }),
    );
  });

  app.post(`${LAB_PATH}/labs`, async (context) => {
    try {
      const form = await readBoundedLabForm(context.req.raw);
      await services.pythonLabHumanVerifier.verify({
        token: formValue(form.get('cf-turnstile-response')),
        remoteIp: context.req.header('cf-connecting-ip') ?? null,
      });
      const visitorToken =
        readCookie(context.req.header('cookie'), 'lantern_python_lab_visitor') ?? randomToken();
      const visitorHash = await hashToken(visitorToken);
      const remoteIp = context.req.header('cf-connecting-ip') ?? null;
      const requestIpHash = remoteIp === null ? null : await hashToken(remoteIp);
      const now = new Date();
      const labId = randomToken();
      const accessToken = randomToken();
      const privateArtifactKey = buildPythonLabPrivateArtifactKey(labId);
      const record: PythonLabRecord = {
        labId,
        visitorHash,
        requestIpHash,
        accessTokenHash: await hashToken(accessToken),
        state: 'generating',
        authorDraft: {
          title: requireFormText(form.get('title'), 'Assignment title', 160),
          prompt: requireFormText(form.get('prompt'), 'Assignment prompt', 12_000),
          starterCode: requireFormText(form.get('starterCode'), 'Starter code', 32_000),
          functionName: requireFunctionName(form.get('functionName')),
        },
        packageVersionId: null,
        privateArtifactKey,
        failureMessage: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + LAB_TRIAL_RETENTION_MS).toISOString(),
      };
      const admission = await services.pythonLabRepository.reserveLab({
        lab: record,
        visitorDay: now.toISOString().slice(0, 10),
        ipWindowStartedAt:
          requestIpHash === null
            ? null
            : new Date(
                Math.floor(now.getTime() / IP_RATE_LIMIT_WINDOW_MS) * IP_RATE_LIMIT_WINDOW_MS,
              ).toISOString(),
      });

      if (admission.status === 'visitor_limited') {
        return context.html(
          renderPythonLabPage({
            title: 'Lantern Python Autograder Lab',
            heading: 'Trial already created',
            body: '<p>This browser can create one Lab each day.</p>',
          }),
          429,
        );
      }

      if (admission.status === 'ip_limited') {
        return context.html(
          renderPythonLabPage({
            title: 'Lantern Python Autograder Lab',
            heading: 'Please wait before creating another Lab',
            body: '<p>Try again shortly.</p>',
          }),
          429,
        );
      }

      try {
        await services.pythonLabArtifactStore.writePendingDraft(privateArtifactKey, {
          kind: 'pending_draft',
          referenceCode: requireFormText(form.get('referenceCode'), 'Reference solution', 32_000),
        });
        await services.pythonLabGenerationScheduler.schedule({ labId });
      } catch {
        await Promise.allSettled([
          services.pythonLabArtifactStore.delete(privateArtifactKey),
          services.pythonLabRepository.deleteLab(labId),
        ]);
        return context.html(
          renderPythonLabPage({
            title: 'Lantern Python Autograder Lab',
            heading: 'Python Lab unavailable',
            notice: 'Python Lab generation could not start. Please try again.',
            body: renderLabCreateForm(readEnv('AUTOGRADER_TURNSTILE_SITE_KEY', services.env) ?? ''),
          }),
          503,
        );
      }

      const response = context.redirect(labUrl(labId), 303);
      appendCookie(
        response.headers,
        'lantern_python_lab_visitor',
        visitorToken,
        `${LAB_PATH}`,
        2 * 24 * 60 * 60,
      );
      appendCookie(
        response.headers,
        labCookieName(labId),
        accessToken,
        `${LAB_PATH}/labs/${labId}`,
        7 * 24 * 60 * 60,
      );
      return response;
    } catch {
      return context.html(
        renderPythonLabPage({
          title: 'Lantern Python Autograder Lab',
          heading: 'Create a gradeable Python assignment',
          notice: 'Python Lab creation failed. Check the submitted fields and try again.',
          body: renderLabCreateForm(readEnv('AUTOGRADER_TURNSTILE_SITE_KEY', services.env) ?? ''),
        }),
        400,
      );
    }
  });

  app.get(`${LAB_PATH}/labs/:labId`, async (context) => {
    const resolved = await resolveAuthorizedLab(context, services);
    if ('response' in resolved) return resolved.response;
    const lab = resolved.lab;
    return context.html(
      renderPythonLabPage({
        title: lab.authorDraft.title,
        heading: lab.authorDraft.title,
        body: renderLabStatus(lab),
      }),
    );
  });

  app.get(`${LAB_PATH}/labs/:labId/status`, async (context) => {
    const resolved = await resolveAuthorizedLab(context, services, 'json');
    if ('response' in resolved) return resolved.response;
    const lab = resolved.lab;
    return context.json({ state: lab.state, failureMessage: lab.failureMessage });
  });

  app.post(`${LAB_PATH}/labs/:labId/candidate-runs`, async (context) => {
    const resolved = await resolveAuthorizedLab(context, services);
    if ('response' in resolved) return resolved.response;
    const lab = resolved.lab;
    let source = lab.authorDraft.starterCode;
    try {
      const form = await readBoundedLabForm(context.req.raw);
      source = requireFormText(form.get('source'), 'Candidate source', 32_000);
      const result = await verifyPythonLabCandidate({
        lab,
        source,
        pythonLabArtifactStore: services.pythonLabArtifactStore,
        sandboxFactory: services.pythonGraderSandboxFactory,
        createId: randomToken,
      });
      return context.html(
        renderPythonLabPage({
          title: lab.authorDraft.title,
          heading: lab.authorDraft.title,
          body: renderCandidatePage(lab, source, result),
        }),
      );
    } catch {
      return context.html(
        renderPythonLabPage({
          title: lab.authorDraft.title,
          heading: lab.authorDraft.title,
          notice: 'Candidate verification failed. Review the code and try again.',
          body: renderCandidatePage(lab, source, null),
        }),
        409,
      );
    }
  });

  app.post(`${LAB_PATH}/labs/:labId/preview`, async (context) => {
    const resolved = await resolveAuthorizedLab(context, services);
    if ('response' in resolved) return resolved.response;
    const lab = resolved.lab;
    if (lab.state !== 'ready' || lab.packageVersionId === null) {
      throw new Error('Python Lab is not ready for learner preview.');
    }
    const packageVersion = await services
      .getRepository()
      .getPackageVersionById(lab.packageVersionId);
    if (packageVersion === null) {
      throw new Error('Python Lab package was not found.');
    }
    const launched = await launchPreviewRuntimeSession({
      repository: services.getRepository(),
      packageVersion,
      artifactStore: services.runtimeArtifactStore,
      previewOrigin: 'adminTestLaunch',
    });

    return context.redirect(
      buildRuntimeSessionUrl({
        runtimeOrigin: requireConfiguredRuntimeOrigin(readEnv('APP_RUNTIME_ORIGIN', services.env)),
        sessionId: launched.runtimeSession.sessionId,
        token: launched.runtimeSession.sessionToken,
      }),
      303,
    );
  });

  app.post(`${LAB_PATH}/labs/:labId/access-requests`, async (context) => {
    const resolved = await resolveAuthorizedLab(context, services);
    if ('response' in resolved) return resolved.response;
    const lab = resolved.lab;
    try {
      const form = await readBoundedLabForm(context.req.raw);
      const now = new Date();
      await services.pythonLabRepository.createAccessRequest({
        requestId: `python-lab-request-${randomToken()}`,
        labId: lab.labId,
        name: requireFormText(form.get('name'), 'Name', 160),
        workEmail: requireWorkEmail(form.get('workEmail')),
        institution: requireFormText(form.get('institution'), 'Institution', 240),
        status: 'new',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + LAB_REQUEST_RETENTION_MS).toISOString(),
      });
      return context.html(
        renderPythonLabPage({
          title: lab.authorDraft.title,
          heading: lab.authorDraft.title,
          notice: 'Canvas access request recorded.',
          body: renderLabStatus(lab),
        }),
        201,
      );
    } catch {
      return context.html(
        renderPythonLabPage({
          title: lab.authorDraft.title,
          heading: lab.authorDraft.title,
          notice: 'Canvas access request failed. Check the submitted fields and try again.',
          body: renderLabStatus(lab),
        }),
        400,
      );
    }
  });
}

async function requireAuthorizedLab(
  context: Context,
  services: PythonLabRouteServices,
): Promise<PythonLabRecord> {
  const labId = context.req.param('labId');

  if (labId === undefined || labId === '') {
    throw new PythonLabAccessError(404, 'Python Lab was not found.');
  }
  const lab = await services.pythonLabRepository.getLabById(labId);

  if (lab === null) {
    throw new PythonLabAccessError(404, 'Python Lab was not found.');
  }
  const token = readCookie(context.req.header('cookie'), labCookieName(labId));

  if (token === null || !timingSafeEqual(await hashToken(token), lab.accessTokenHash)) {
    throw new PythonLabAccessError(403, 'Python Lab access was denied.');
  }

  return lab;
}

async function resolveAuthorizedLab(
  context: Context,
  services: PythonLabRouteServices,
  responseFormat: 'html' | 'json' = 'html',
): Promise<{ readonly lab: PythonLabRecord } | { readonly response: Response }> {
  try {
    return { lab: await requireAuthorizedLab(context, services) };
  } catch (error) {
    if (!(error instanceof PythonLabAccessError)) {
      throw error;
    }

    if (responseFormat === 'json') {
      return { response: context.json({ error: error.message }, error.status) };
    }

    return {
      response: context.html(
        renderPythonLabPage({
          title: 'Lantern Python Autograder Lab',
          heading: error.status === 404 ? 'Python Lab not found' : 'Python Lab access denied',
          body: `<p>${escapeHtml(error.message)}</p>`,
        }),
        error.status,
      ),
    };
  }
}

class PythonLabAccessError extends Error {
  constructor(
    readonly status: 403 | 404,
    message: string,
  ) {
    super(message);
  }
}
