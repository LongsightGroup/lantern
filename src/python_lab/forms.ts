const LAB_FORM_MAX_BYTES = 80_000;

export function formValue(value: string | null): string {
  return value ?? '';
}

export function requireFormText(
  value: string | null,
  label: string,
  maxLength: number,
): string {
  const text = formValue(value);
  if (text.trim() === '' || text.length > maxLength) {
    throw new Error(`${label} is required and must contain at most ${maxLength} characters.`);
  }
  return text;
}

export function requireFunctionName(value: string | null): string {
  const name = formValue(value);
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(name)) {
    throw new Error('Function name must be a valid Python identifier.');
  }
  return name;
}

export function requireWorkEmail(value: string | null): string {
  const email = formValue(value).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('Work email is required.');
  }
  return email;
}

export async function readBoundedLabForm(request: Request): Promise<URLSearchParams> {
  const contentType = request.headers.get('content-type') ?? '';

  if (!contentType.startsWith('application/x-www-form-urlencoded')) {
    throw new Error('Python Lab requests must use a URL-encoded form.');
  }

  const contentLength = request.headers.get('content-length');

  if (contentLength !== null) {
    const declaredLength = Number(contentLength);

    if (
      !Number.isSafeInteger(declaredLength) || declaredLength < 0 ||
      declaredLength > LAB_FORM_MAX_BYTES
    ) {
      throw new Error('Python Lab form is too large.');
    }
  }

  if (request.body === null) {
    throw new Error('Python Lab form is required.');
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (true) {
      const next = await reader.read();

      if (next.done) break;
      size += next.value.byteLength;

      if (size > LAB_FORM_MAX_BYTES) {
        await reader.cancel('Python Lab form exceeded its size limit.');
        throw new Error('Python Lab form is too large.');
      }

      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new URLSearchParams(new TextDecoder().decode(body));
}
