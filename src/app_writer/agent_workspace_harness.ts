import { expectString, parseModelRequestMetadata } from './binding_result.ts';
import type {
  AppWriterWorkspaceHarness,
  AppWriterWorkspaceHarnessError,
  AppWriterWorkspaceHarnessResult,
} from './workspace_runner.ts';
import { AppWriterWorkspaceHarnessError as WorkspaceHarnessError } from './workspace_runner.ts';
import type { AppWriterAgentNamespace } from './agent_session.ts';
import { parseWorkspaceHarnessResponse } from './workspace_harness_result.ts';

const HARNESS_AUTHOR_PATH = '/workspace-harness/author';
const HARNESS_REPAIR_PATH = '/workspace-harness/repair';

export function createCloudflareAppWriterAgentWorkspaceHarness(
  namespace: AppWriterAgentNamespace,
): AppWriterWorkspaceHarness {
  return {
    async author(input) {
      return parseWorkspaceHarnessResult(
        await postAgentJson({
          namespace,
          generationId: input.generationInput.generationId,
          path: HARNESS_AUTHOR_PATH,
          body: input,
          responseName: 'app writer Agent workspace authoring response',
        }),
        'workspaceHarnessAuthorResult',
      );
    },
    async repair(input) {
      return parseWorkspaceHarnessResult(
        await postAgentJson({
          namespace,
          generationId: input.generationInput.generationId,
          path: HARNESS_REPAIR_PATH,
          body: input,
          responseName: 'app writer Agent workspace repair response',
        }),
        'workspaceHarnessRepairResult',
      );
    },
  };
}

async function postAgentJson(input: {
  namespace: AppWriterAgentNamespace;
  generationId: string;
  path: string;
  body: unknown;
  responseName: string;
}): Promise<unknown> {
  const stub = input.namespace.get(input.namespace.idFromName(input.generationId));
  const response = await stub.fetch(
    new Request(`https://app-writer-agent.internal${input.path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(input.body),
    }),
  );
  const responseBody = await response.text();

  if (!response.ok) {
    throw parseWorkspaceHarnessError({
      responseName: input.responseName,
      status: response.status,
      responseBody,
    });
  }

  try {
    return JSON.parse(responseBody);
  } catch {
    throw new TypeError(`${input.responseName} must be valid JSON.`);
  }
}

function parseWorkspaceHarnessError(input: {
  responseName: string;
  status: number;
  responseBody: string;
}): AppWriterWorkspaceHarnessError {
  try {
    const parsed = JSON.parse(input.responseBody) as unknown;
    const record = expectRecord(parsed, `${input.responseName}.errorResponse`);
    const errorRecord = expectRecord(record.error, `${input.responseName}.errorResponse.error`);
    const metadata = errorRecord.modelRequestMetadata === undefined
      ? []
      : parseModelRequestMetadata(
        errorRecord.modelRequestMetadata,
        `${input.responseName}.errorResponse.error.modelRequestMetadata`,
      );

    return new WorkspaceHarnessError({
      code: expectString(errorRecord.code, `${input.responseName}.errorResponse.error.code`),
      message: expectString(
        errorRecord.message,
        `${input.responseName}.errorResponse.error.message`,
      ),
      modelRequestMetadata: metadata,
      notes: errorRecord.notes === undefined
        ? []
        : expectStringArray(errorRecord.notes, `${input.responseName}.errorResponse.error.notes`),
    });
  } catch {
    return new WorkspaceHarnessError({
      code: 'provider_error',
      message: `${input.responseName} failed with HTTP ${input.status}: ${input.responseBody}`,
    });
  }
}

function parseWorkspaceHarnessResult(
  value: unknown,
  fieldName: string,
): AppWriterWorkspaceHarnessResult {
  return parseWorkspaceHarnessResponse(value, fieldName);
}

function expectRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function expectStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be a string array.`);
  }

  return value.map((item, index) => {
    if (typeof item !== 'string') {
      throw new TypeError(`${fieldName}[${index}] must be text.`);
    }

    return item;
  });
}
