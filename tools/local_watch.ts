import { watch } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { WatchEventLike } from '../src/authoring/watch.ts';

/** Adapts Node filesystem notifications to the authoring watch loop. */
export function watchLocalPackage(root: string): {
  iterator: AsyncIterator<WatchEventLike>;
  close(): void;
} {
  const controller = new AbortController();
  async function* events(): AsyncGenerator<WatchEventLike> {
    try {
      for await (const event of watch(root, { recursive: true, signal: controller.signal })) {
        yield { paths: [event.filename === null ? resolve(root) : resolve(root, event.filename)] };
      }
    } catch (error) {
      if (!controller.signal.aborted) throw error;
    }
  }
  return { iterator: events(), close: () => controller.abort() };
}
