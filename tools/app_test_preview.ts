import { runLocalPreviewAssertions } from '../src/authoring/local_preview_assertions.ts';
import {
  type RenderedPreviewAssertionResult,
  renderPreviewAssertionResult,
} from '../src/authoring/local_preview_assertion_report.ts';
import { getDefaultWatchDebounceMs, runWatchMode } from '../src/authoring/watch.ts';

export interface AppTestPreviewArgs {
  packageRoot: string;
  watch: boolean;
  once: boolean;
  debounceMs: number;
}

if (import.meta.main) {
  try {
    const args = parseArgs(Deno.args);
    const exitCode = args.watch
      ? await runWatchCommand(args)
      : await runOneShotCommand(args.packageRoot);
    Deno.exit(exitCode);
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Lantern preview assertion command failed.',
    );
    Deno.exit(1);
  }
}

export function parseArgs(args: string[]): AppTestPreviewArgs {
  let packageRoot: string | null = null;
  let watch = false;
  let once = false;

  for (const arg of args) {
    if (arg === '--watch') {
      watch = true;
      continue;
    }

    if (arg === '--once') {
      once = true;
      continue;
    }

    if (packageRoot === null) {
      packageRoot = arg;
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  if (packageRoot === null) {
    throw new Error('Usage: deno task app:test-preview <package-root> [--watch] [--once]');
  }

  if (once && !watch) {
    throw new Error('--once is only supported together with --watch.');
  }

  return {
    packageRoot,
    watch,
    once,
    debounceMs: getDefaultWatchDebounceMs(),
  };
}

async function runOneShotCommand(packageRoot: string): Promise<number> {
  const rendered = await runOneShotCycle(packageRoot);

  console.log(rendered.output);

  return rendered.exitCode;
}

async function runWatchCommand(args: AppTestPreviewArgs): Promise<number> {
  console.log(`Lantern preview watch started for ${args.packageRoot}.`);
  const watcher = Deno.watchFs(args.packageRoot, {
    recursive: true,
  });

  try {
    return await runWatchMode({
      iterator: watcher[Symbol.asyncIterator](),
      once: args.once,
      debounceMs: args.debounceMs,
      log: (message) => console.log(message),
      runCycle: async (changedPaths) => {
        const label = changedPaths.length === 0
          ? 'initial'
          : `rerun for ${changedPaths.join(', ')}`;
        console.log(`\n[lantern-preview-test] ${label}`);

        const rendered = await runOneShotCycle(args.packageRoot);

        console.log(rendered.output);

        return rendered.exitCode;
      },
    });
  } finally {
    watcher.close();
  }
}

async function runOneShotCycle(packageRoot: string): Promise<RenderedPreviewAssertionResult> {
  return renderPreviewAssertionResult(await runLocalPreviewAssertions(packageRoot));
}
