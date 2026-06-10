import type { AppPackageGenerationResult, AppWriterWorkspaceFile } from './types.ts';
import { buildTypeScriptCompilerMissingFinding } from './service_failures.ts';
import type { RunAppPackageGenerationInput } from './service_core.ts';
import {
  mergeWorkspaceFiles,
  selectNonPackageWorkspaceFiles,
  selectPackageWorkspaceFiles,
} from './workspace_files.ts';

const TYPESCRIPT_AUTHORING_SOURCE_PATHS = new Set(['source/app.ts', 'source/content_model.ts']);

export async function compileTypeScriptSourceIfNeeded(input: {
  input: RunAppPackageGenerationInput;
  generation: AppPackageGenerationResult;
}) {
  const compiler = input.input.sourceCompiler;

  if (compiler === undefined) {
    return {
      files: projectTypeScriptAuthoringWorkspaceFiles({
        baseFiles: input.generation.files,
        compiledFiles: input.generation.files,
      }),
      notes: [],
      validationFindings: [buildTypeScriptCompilerMissingFinding()],
    };
  }

  return await compiler
    .compile({
      generationId: input.input.generationId,
      appPlan: input.generation.appPlan,
      selectedStarterId: input.generation.selectedStarterId,
      files: selectTypeScriptCompilerInputFiles(input.generation.files),
    })
    .then((compiled) => ({
      ...compiled,
      files: projectTypeScriptAuthoringWorkspaceFiles({
        baseFiles: input.generation.files,
        compiledFiles: compiled.files,
      }),
    }));
}

function selectTypeScriptCompilerInputFiles(
  files: readonly AppWriterWorkspaceFile[],
): AppWriterWorkspaceFile[] {
  const selectedFiles = new Map<string, AppWriterWorkspaceFile>();

  for (const file of selectPackageWorkspaceFiles(files)) {
    selectedFiles.set(file.path, file);
  }

  for (const file of files) {
    if (isTypeScriptAuthoringSourcePath(file.path)) {
      selectedFiles.set(file.path, {
        ...file,
        role: 'package',
      });
    }
  }

  return [...selectedFiles.values()];
}

function projectTypeScriptAuthoringWorkspaceFiles(input: {
  baseFiles: readonly AppWriterWorkspaceFile[];
  compiledFiles: readonly AppWriterWorkspaceFile[];
}): AppWriterWorkspaceFile[] {
  const nonPackageFiles = selectNonPackageWorkspaceFiles(input.baseFiles);
  const authoringSourceFiles = [...input.baseFiles, ...input.compiledFiles]
    .filter((file) => isTypeScriptAuthoringSourcePath(file.path))
    .map(
      (file): AppWriterWorkspaceFile => ({
        ...file,
        role: 'evidence',
      }),
    );
  const packageFiles = input.compiledFiles.filter(
    (file) => !isTypeScriptAuthoringSourcePath(file.path),
  );

  return mergeWorkspaceFiles([...nonPackageFiles, ...authoringSourceFiles], packageFiles);
}

function isTypeScriptAuthoringSourcePath(path: string): boolean {
  return TYPESCRIPT_AUTHORING_SOURCE_PATHS.has(path);
}
