import {
  groupLocalAppDiagnostics,
  type LocalAppValidationResult,
  validateLocalAppPackage,
} from '../src/authoring/local_app.ts';

export interface AppValidateArgs {
  packageRoot: string;
  json: boolean;
}

export async function runAppValidate(args: string[]): Promise<number> {
  try {
    const parsed = readArgs(args);
    const result = await validateLocalAppPackage(parsed.packageRoot);

    if (parsed.json) {
      console.log(serializeValidationResult(result));
    } else if (result.ok) {
      console.log(renderValidationSuccess(result));
    } else {
      console.error('Lantern app validation failed.');
      console.error(renderValidationFailure(result));
    }

    return result.ok ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Lantern app validation failed.');

    return 1;
  }
}

export function readArgs(args: string[]): AppValidateArgs {
  let packageRoot: string | null = null;
  let json = false;

  for (const arg of args) {
    if (arg === '--json') {
      json = true;
      continue;
    }

    if (packageRoot === null) {
      packageRoot = arg;
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  if (packageRoot === null) {
    throw new Error('Usage: deno task app:validate <package-root> [--json]');
  }

  return {
    packageRoot,
    json,
  };
}

export function renderValidationSuccess(
  result: Extract<LocalAppValidationResult, { ok: true }>,
): string {
  const lines = [
    'Lantern app validation passed.',
    `- App ID: ${result.appPackage.reviewData.appId}`,
    `- Version: ${result.appPackage.reviewData.version}`,
    `- Entrypoint: ${result.appPackage.manifest.entrypoint}`,
    `- Capabilities: ${result.appPackage.reviewData.capabilities.join(', ')}`,
    `- Preview tests: ${String(result.appPackage.previewTests.length)}`,
  ];

  for (const warning of result.warnings) {
    lines.push(`- Warning: ${warning}`);
  }

  return lines.join('\n');
}

export function renderValidationFailure(
  result: Extract<LocalAppValidationResult, { ok: false }>,
): string {
  const groups = groupLocalAppDiagnostics(result.diagnostics);

  if (groups.length === 0) {
    return '- Package\n  - Lantern app validation failed without a diagnostic record.';
  }

  return groups
    .map((group) =>
      [
        `- ${group.label}`,
        ...group.diagnostics.flatMap((diagnostic) => [
          `  - ${diagnostic.message}`,
          `    Fix: ${diagnostic.fix}`,
        ]),
      ].join('\n')
    )
    .join('\n');
}

export function serializeValidationResult(result: LocalAppValidationResult): string {
  if (!result.ok) {
    return JSON.stringify(
      {
        ok: false,
        diagnostics: result.diagnostics,
        warnings: result.warnings,
      },
      null,
      2,
    );
  }

  return JSON.stringify(
    {
      ok: true,
      diagnostics: [],
      warnings: result.warnings,
      app: {
        appId: result.appPackage.reviewData.appId,
        version: result.appPackage.reviewData.version,
        title: result.appPackage.reviewData.title,
        entrypoint: result.appPackage.manifest.entrypoint,
        capabilities: result.appPackage.reviewData.capabilities,
        previewTestCount: result.appPackage.previewTests.length,
      },
    },
    null,
    2,
  );
}

if (import.meta.main) {
  Deno.exit(await runAppValidate(Deno.args));
}
