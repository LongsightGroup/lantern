import type {
  AppWriterAgentEnv,
  DurableObjectState,
  WorkspaceHarnessResponse,
} from './agent_types.ts';
import { isAppWriterAgentHarnessError } from './agent_errors.ts';
import { AGENT_SESSION_STORAGE_KEY, loadAgentSnapshot, streamAgentEvents } from './agent_events.ts';
import {
  readObserveInput,
  readWorkspaceAuthorInput,
  readWorkspaceRepairInput,
} from './agent_input.ts';
import { authorWorkspace, repairWorkspace } from './agent_workspace_shell.ts';
import { jsonError } from './http_json.ts';

export class AppWriterAgent {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: AppWriterAgentEnv,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.endsWith('/observe')) {
      return await this.handleObserve(request);
    }

    if (url.pathname.endsWith('/state')) {
      return await this.handleState(request);
    }

    if (url.pathname.endsWith('/events')) {
      return this.handleEvents(request);
    }

    if (url.pathname.endsWith('/workspace-harness/author')) {
      return await this.handleWorkspaceAuthor(request);
    }

    if (url.pathname.endsWith('/workspace-harness/repair')) {
      return await this.handleWorkspaceRepair(request);
    }

    return jsonError(404, 'not_found', 'App writer Agent endpoint was not found.');
  }

  private async handleObserve(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return jsonError(405, 'method_not_allowed', 'App writer Agent observe requires POST.');
    }

    const input = await readObserveInput(request);
    await this.state.storage.put(AGENT_SESSION_STORAGE_KEY, input);

    return Response.json({ ok: true });
  }

  private async handleState(request: Request): Promise<Response> {
    if (request.method !== 'GET') {
      return jsonError(405, 'method_not_allowed', 'App writer Agent state requires GET.');
    }

    return Response.json(await this.loadSnapshot());
  }

  private handleEvents(request: Request): Response {
    if (request.method !== 'GET') {
      return jsonError(405, 'method_not_allowed', 'App writer Agent events require GET.');
    }

    return streamAgentEvents({
      loadSnapshot: () => this.loadSnapshot(),
    });
  }

  private async handleWorkspaceAuthor(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return jsonError(405, 'method_not_allowed', 'Workspace harness authoring requires POST.');
    }

    return await this.handleWorkspaceHarnessRequest(async () =>
      await authorWorkspace({
        state: this.state,
        env: this.env,
        request: await readWorkspaceAuthorInput(request),
      })
    );
  }

  private async handleWorkspaceRepair(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return jsonError(405, 'method_not_allowed', 'Workspace harness repair requires POST.');
    }

    return await this.handleWorkspaceHarnessRequest(async () =>
      await repairWorkspace({
        state: this.state,
        env: this.env,
        request: await readWorkspaceRepairInput(request),
      })
    );
  }

  private async handleWorkspaceHarnessRequest(
    run: () => Promise<WorkspaceHarnessResponse>,
  ): Promise<Response> {
    try {
      return Response.json(await run());
    } catch (error) {
      if (isAppWriterAgentHarnessError(error)) {
        return Response.json(
          {
            error: {
              code: error.code,
              message: error.message,
              notes: error.notes,
              modelRequestMetadata: error.modelRequestMetadata,
            },
          },
          { status: 500 },
        );
      }

      return Response.json(
        {
          error: {
            code: 'workspace_read_write_failed',
            message: error instanceof Error ? error.message : 'Workspace harness failed.',
            notes: [],
            modelRequestMetadata: [],
          },
        },
        { status: 500 },
      );
    }
  }

  private async loadSnapshot() {
    return await loadAgentSnapshot({
      state: this.state,
      env: this.env,
    });
  }
}
