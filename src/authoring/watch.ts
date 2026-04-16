const DEFAULT_WATCH_DEBOUNCE_MS = 75;

export interface WatchEventLike {
  paths: string[];
}

export interface RunWatchModeInput {
  iterator: AsyncIterator<WatchEventLike>;
  runCycle: (changedPaths: string[]) => Promise<number>;
  once: boolean;
  debounceMs?: number;
  log: (message: string) => void;
}

export function getDefaultWatchDebounceMs(): number {
  return DEFAULT_WATCH_DEBOUNCE_MS;
}

export async function runWatchMode(input: RunWatchModeInput): Promise<number> {
  let exitCode = await input.runCycle([]);

  if (input.once) {
    return exitCode;
  }

  while (true) {
    const changedPaths = await collectWatchBatch(
      input.iterator,
      input.debounceMs ?? DEFAULT_WATCH_DEBOUNCE_MS,
    );

    if (changedPaths === null) {
      return exitCode;
    }

    input.log(`Change detected in ${changedPaths.join(', ')}. Rerunning preview checks...`);
    exitCode = await input.runCycle(changedPaths);
  }
}

export async function collectWatchBatch(
  iterator: AsyncIterator<WatchEventLike>,
  debounceMs: number,
): Promise<string[] | null> {
  const first = await iterator.next();

  if (first.done) {
    return null;
  }

  const changedPaths = new Set(first.value.paths);

  while (true) {
    const timer = createDebounceTimer(debounceMs);
    const next = await Promise.race([
      iterator.next().then((value) => ({
        kind: 'event' as const,
        value,
      })),
      timer.promise.then(() => ({
        kind: 'timeout' as const,
      })),
    ]);
    timer.cancel();

    if (next.kind === 'timeout') {
      return [...changedPaths].sort();
    }

    if (next.value.done) {
      return [...changedPaths].sort();
    }

    for (const path of next.value.value.paths) {
      changedPaths.add(path);
    }
  }
}

function createDebounceTimer(durationMs: number): {
  promise: Promise<void>;
  cancel(): void;
} {
  let timerId: ReturnType<typeof setTimeout> | null = null;

  return {
    promise: new Promise((resolve) => {
      timerId = setTimeout(resolve, durationMs);
    }),
    cancel() {
      if (timerId !== null) {
        clearTimeout(timerId);
      }
    },
  };
}
