export async function readCloudflareAiResponseText(response: unknown): Promise<string> {
  if (typeof response === 'string') {
    return normalizeCloudflareAiResponseText(response);
  }

  if (response instanceof ReadableStream) {
    return await readAiResponseStream(response);
  }

  if (response instanceof Response && response.body !== null) {
    return await readAiResponseStream(response.body);
  }

  if (typeof response === 'object' && response !== null) {
    const record = response as Record<string, unknown>;

    if (typeof record.response === 'string') {
      return normalizeCloudflareAiResponseText(record.response);
    }

    if (record.response instanceof ReadableStream) {
      return await readAiResponseStream(record.response);
    }
  }

  throw new Error('Workers AI response did not contain text.');
}

export function normalizeCloudflareAiResponseText(text: string): string {
  if (!looksLikeServerSentEvents(text)) {
    return text;
  }

  return readAiResponseEvents(text);
}

export function normalizeWorkspaceCodeForExecution(
  rawCode: string,
  normalizeCode: (code: string) => string,
): string {
  return stripTrailingArrowFunctionSemicolon(normalizeCode(rawCode));
}

async function readAiResponseStream(stream: ReadableStream): Promise<string> {
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
  let output = '';
  let pending = '';

  while (true) {
    const next = await reader.read();

    if (next.done) {
      return `${output}${parseAiStreamEvent(pending)}`;
    }

    pending += next.value;
    const events = pending.split(/\r?\n\r?\n/);
    pending = events.pop() ?? '';

    for (const event of events) {
      output += parseAiStreamEvent(event);
    }
  }
}

function readAiResponseEvents(text: string): string {
  let output = '';
  const events = text.split(/\r?\n\r?\n/);

  for (const event of events) {
    output += parseAiStreamEvent(event);
  }

  return output;
}

function looksLikeServerSentEvents(text: string): boolean {
  return text.split(/\r?\n/).some((line) => {
    const normalized = line.trimStart();

    return normalized.startsWith('data:') || normalized.startsWith('event:');
  });
}

function stripTrailingArrowFunctionSemicolon(code: string): string {
  const trimmed = code.trim();

  if (!trimmed.endsWith(';') || !looksLikeArrowFunctionExpression(trimmed)) {
    return code;
  }

  return trimmed.slice(0, -1);
}

function looksLikeArrowFunctionExpression(code: string): boolean {
  return /^(?:async\s+)?(?:\([^)]*\)|[a-zA-Z_$][\w$]*)\s*=>[\s\S]*;\s*$/.test(code);
}

function parseAiStreamEvent(event: string): string {
  if (event === '') {
    return '';
  }

  const lines = event.split(/\r?\n/).map((line) => line.trimStart());
  const hasServerSentEventFields = lines.some(
    (line) => line.startsWith('event:') || line.startsWith('data:'),
  );
  const rawDataLines = lines.filter((line) => line.startsWith('data:'));
  const dataLines = rawDataLines
    .map((line) => line.replace(/^data:\s?/, '').trim())
    .filter((line) => line !== '' && line !== '[DONE]');

  if (dataLines.length === 0) {
    return hasServerSentEventFields ? '' : event;
  }

  return dataLines
    .map((line) => {
      try {
        const parsed = JSON.parse(line) as {
          response?: unknown;
          choices?: Array<{ delta?: { content?: unknown } }>;
        };

        return typeof parsed.response === 'string'
          ? parsed.response
          : typeof parsed.choices?.[0]?.delta?.content === 'string'
          ? parsed.choices[0].delta.content
          : '';
      } catch {
        return line;
      }
    })
    .join('');
}
