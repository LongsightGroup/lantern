import {
  createLocalDevRequestHandler,
  loadLocalDevState,
  renderLocalDevStateSummary,
} from '../src/authoring/local_dev.ts';
import { getDefaultWatchDebounceMs, runWatchMode } from '../src/authoring/watch.ts';

try {
  const args = readArgs(Deno.args);
  let state = await loadLocalDevState(args.packageRoot, {
    logger: logPreviewEntry,
  });

  const server = Deno.serve(
    {
      hostname: '127.0.0.1',
      port: args.port,
      onListen() {},
    },
    createLocalDevRequestHandler({
      getState() {
        return state;
      },
      getBaseUrl() {
        return baseUrl;
      },
    }),
  );
  const address = server.addr as Deno.NetAddr;
  const baseUrl = `http://${address.hostname}:${address.port}/`;

  console.log(`Lantern authoring dev loop listening on ${baseUrl}`);
  console.log(renderLocalDevStateSummary({ state, baseUrl }));
  let exitCode = currentExitCode(state);
  let initialWatchRun = true;

  const watcher = Deno.watchFs(args.packageRoot, {
    recursive: true,
  });

  try {
    await runWatchMode({
      iterator: watcher[Symbol.asyncIterator](),
      once: args.once,
      debounceMs: args.debounceMs,
      log: (message) => console.log(message),
      async runCycle(changedPaths) {
        if (initialWatchRun) {
          initialWatchRun = false;
          return exitCode;
        }

        if (changedPaths.length > 0) {
          console.log(`\n[lantern-app-dev] rerun for ${changedPaths.join(', ')}`);
        }

        state = await loadLocalDevState(args.packageRoot, {
          logger: logPreviewEntry,
        });
        console.log(renderLocalDevStateSummary({ state, baseUrl }));

        exitCode = currentExitCode(state);

        return exitCode;
      },
    });
  } finally {
    watcher.close();
    await server.shutdown();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Lantern authoring dev loop failed.');
  Deno.exit(1);
}

interface AppDevArgs {
  packageRoot: string;
  port: number;
  debounceMs: number;
  once: boolean;
}

function readArgs(args: string[]): AppDevArgs {
  let packageRoot: string | null = null;
  let port = 8420;
  let once = false;

  for (const arg of args) {
    if (arg === '--once') {
      once = true;
      continue;
    }

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
    throw new Error('Usage: deno task app:dev <package-root> [--port=8420] [--once]');
  }

  return {
    packageRoot,
    port,
    debounceMs: getDefaultWatchDebounceMs(),
    once,
  };
}

function parsePort(value: string): number {
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid --port value: ${value}`);
  }

  return port;
}

function logPreviewEntry(entry: {
  eventType: string;
  detail: Record<string, unknown>;
  occurredAt: string;
}): void {
  console.log(
    `[lantern-preview] ${entry.occurredAt} ${entry.eventType} ${JSON.stringify(entry.detail)}`,
  );
}

function currentExitCode(state: Awaited<ReturnType<typeof loadLocalDevState>>): number {
  return state.kind === 'invalid' || state.previewCheck.kind !== 'passed' ? 1 : 0;
}
