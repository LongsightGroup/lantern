export async function readJson(request: Request, invalidBodyMessage: string): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new TypeError(invalidBodyMessage);
  }
}

export function jsonError(status: number, code: string, message: string): Response {
  return Response.json(
    {
      error: {
        code,
        message,
      },
    },
    { status },
  );
}
