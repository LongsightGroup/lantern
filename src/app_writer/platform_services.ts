import {
  expectRecord,
  expectStarterId,
  expectString,
  parseAppGenerationPlan,
  parseWorkspaceFiles,
} from './binding_result.ts';
import type {
  AppPackagePreviewer,
  AppPackagePreviewInput,
  AppPackageSourceCompileInput,
  AppPackageSourceCompiler,
} from './types.ts';
import { jsonError, readJson } from './http_json.ts';

const SOURCE_COMPILER_PATH = '/app-writer/source-compiler/compile';
const PREVIEWER_PATH = '/app-writer/preview/run';

export function createAppWriterPlatformServicesHandler(input: {
  sourceCompiler?: AppPackageSourceCompiler;
  previewer?: AppPackagePreviewer;
}): { fetch(request: Request): Promise<Response> } {
  return {
    async fetch(request) {
      const url = new URL(request.url);

      if (request.method !== 'POST') {
        return jsonError(405, 'method_not_allowed', 'App writer service endpoints require POST.');
      }

      if (url.pathname === SOURCE_COMPILER_PATH) {
        if (input.sourceCompiler === undefined) {
          return jsonError(
            503,
            'source_compiler_unavailable',
            'App writer source compiler is not configured for this service.',
          );
        }

        const compileInput = parseSourceCompileInput(
          await readJson(request, 'App writer service request body must be valid JSON.'),
        );
        const result = await input.sourceCompiler.compile(compileInput);

        return Response.json(result);
      }

      if (url.pathname === PREVIEWER_PATH) {
        if (input.previewer === undefined) {
          return jsonError(
            503,
            'previewer_unavailable',
            'App writer previewer is not configured for this service.',
          );
        }

        const previewInput = parsePreviewInput(
          await readJson(request, 'App writer service request body must be valid JSON.'),
        );
        const previewResult = await input.previewer.preview(previewInput);

        return Response.json(previewResult);
      }

      return jsonError(404, 'not_found', 'App writer service endpoint was not found.');
    },
  };
}

function parseSourceCompileInput(value: unknown): AppPackageSourceCompileInput {
  const record = expectRecord(value, 'sourceCompileInput');

  return {
    generationId: expectString(record.generationId, 'sourceCompileInput.generationId'),
    appPlan: parseAppGenerationPlan(record.appPlan, 'sourceCompileInput.appPlan'),
    selectedStarterId: expectStarterId(
      record.selectedStarterId,
      'sourceCompileInput.selectedStarterId',
    ),
    files: parseWorkspaceFiles(record.files, 'sourceCompileInput.files'),
  };
}

function parsePreviewInput(value: unknown): AppPackagePreviewInput {
  const record = expectRecord(value, 'previewInput');

  return {
    generationId: expectString(record.generationId, 'previewInput.generationId'),
    selectedStarterId: expectStarterId(record.selectedStarterId, 'previewInput.selectedStarterId'),
    files: parseWorkspaceFiles(record.files, 'previewInput.files'),
  };
}
