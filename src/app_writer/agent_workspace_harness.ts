import {
  parseProgressUpdates,
  parseValidationFindings,
  parseWorkspaceFiles,
} from './binding_result.ts';
import type { AppGenerationValidationFinding, AppWriterWorkspaceFile } from './types.ts';
import type {
  AppWriterWorkspaceHarness,
  AppWriterWorkspaceHarnessResult,
} from './workspace_runner.ts';
import type { AppWriterAgentNamespace } from './agent_session.ts';

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
    throw new Error(`${input.responseName} failed with HTTP ${response.status}: ${responseBody}`);
  }

  try {
    return JSON.parse(responseBody);
  } catch {
    throw new TypeError(`${input.responseName} must be valid JSON.`);
  }
}

function parseWorkspaceHarnessResult(
  value: unknown,
  fieldName: string,
): AppWriterWorkspaceHarnessResult {
  const record = expectRecord(value, fieldName);

  return {
    files: parseWorkspaceFiles(record.files, `${fieldName}.files`) as AppWriterWorkspaceFile[],
    progressUpdates: parseProgressUpdates(record.progressUpdates, `${fieldName}.progressUpdates`),
    notes: expectStringArray(record.notes, `${fieldName}.notes`),
    validationFindings:
      record.validationFindings === undefined
        ? []
        : (parseValidationFindings(
            record.validationFindings,
            `${fieldName}.validationFindings`,
          ) as AppGenerationValidationFinding[]),
  };
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
