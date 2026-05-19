import { groupLocalAppDiagnostics, type LocalAppValidationDiagnostic } from './local_app.ts';
import type {
  FailedLocalPreviewAssertionRuntimeRun,
  LocalPreviewAssertionExpectation,
  LocalPreviewAssertionResult,
  LocalPreviewAssertionRunResult,
  SuccessfulLocalPreviewAssertionRun,
} from './local_preview_assertions.ts';

export interface RenderedPreviewAssertionResult {
  exitCode: number;
  output: string;
}

export type PreviewAssertionReportInput =
  | LocalPreviewAssertionRunResult
  | Omit<SuccessfulLocalPreviewAssertionRun, 'packageRoot'>
  | Omit<FailedLocalPreviewAssertionRuntimeRun, 'packageRoot'>;

export function renderPreviewAssertionResult(
  result: PreviewAssertionReportInput,
): RenderedPreviewAssertionResult {
  if (!result.ok && 'kind' in result && result.kind === 'validation_failed') {
    return {
      exitCode: 1,
      output: renderValidationFailure(result.diagnostics),
    };
  }

  if (!result.ok) {
    const detailLines = result.details.map((detail) => `- ${detail}`);

    return {
      exitCode: 1,
      output: [
        'Lantern preview assertions failed before checks could run.',
        result.message,
        ...detailLines,
      ].join('\n'),
    };
  }

  if (result.failedCount === 0) {
    return {
      exitCode: 0,
      output:
        `Lantern preview assertions passed. ${result.passedCount}/${result.results.length} checks passed.`,
    };
  }

  const failureLines = result.results
    .filter((item) => !item.passed)
    .flatMap((item) => renderAssertionFailure(item));

  return {
    exitCode: 1,
    output: [
      `Lantern preview assertions failed. ${result.passedCount} passed, ${result.failedCount} failed.`,
      ...failureLines,
    ].join('\n'),
  };
}

export function renderValidationFailure(
  diagnostics: readonly LocalAppValidationDiagnostic[],
): string {
  const lines = ['Lantern preview assertions blocked by package validation.'];

  for (const group of groupLocalAppDiagnostics(diagnostics)) {
    lines.push(group.label);

    for (const diagnostic of group.diagnostics) {
      lines.push(`- ${diagnostic.message}`);
      lines.push(`  Fix: ${diagnostic.fix}`);
    }
  }

  return lines.join('\n');
}

function renderAssertionFailure(result: LocalPreviewAssertionResult): string[] {
  const lines = [
    `- ${result.name}`,
    `  Selector: ${result.selector}`,
    `  Expectation: ${describeExpectation(result.expectation)}`,
    `  Failure: ${result.message}`,
  ];

  if (typeof result.actualText === 'string') {
    lines.push(`  Actual: ${result.actualText}`);
  }

  return lines;
}

function describeExpectation(expectation: LocalPreviewAssertionExpectation): string {
  if (expectation.kind === 'exists') {
    return 'selector exists';
  }

  if (expectation.kind === 'text') {
    return `exact text "${expectation.value}"`;
  }

  return `contains "${expectation.value}"`;
}
