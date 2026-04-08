import {
  createLocalPreviewHarness,
  type LocalPreviewLogEntry,
} from '../src/authoring/local_preview.ts';
import { validateLocalAppPackage } from '../src/authoring/local_app.ts';

try {
  const { packageRoot, port } = readArgs(Deno.args);
  const result = await validateLocalAppPackage(packageRoot);

  if (!result.ok || !result.appPackage) {
    console.error('Lantern app preview blocked.');

    for (const issue of result.issues) {
      console.error(`- ${issue}`);
    }

    Deno.exit(1);
  }

  const harness = createLocalPreviewHarness({
    appPackage: result.appPackage,
    logger: logPreviewEntry,
  });

  console.log(
    `Lantern authoring preview listening on http://localhost:${port}${harness.entrypointPath}`,
  );

  Deno.serve({ port }, (request) => harness.handle(request));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Lantern app preview failed.');
  Deno.exit(1);
}

function readArgs(args: string[]): {
  packageRoot: string;
  port: number;
} {
  let packageRoot: string | null = null;
  let port = 8420;

  for (const arg of args) {
    if (arg.startsWith('--port=')) {
      port = parsePort(arg.slice('--port='.length));
      continue;
    }

    if (packageRoot === null) {
      packageRoot = arg;
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  if (packageRoot === null) {
    throw new Error('Usage: deno task app:preview <package-root> [--port=8420]');
  }

  return {
    packageRoot,
    port,
  };
}

function parsePort(value: string): number {
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid --port value: ${value}`);
  }

  return port;
}

function logPreviewEntry(entry: LocalPreviewLogEntry): void {
  console.log(
    `[lantern-preview] ${entry.occurredAt} ${entry.eventType} ${JSON.stringify(entry.detail)}`,
  );
}
