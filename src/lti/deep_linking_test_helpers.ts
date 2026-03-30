import { assertEquals } from "@std/assert";

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  const payload = parts[1];

  if (!payload) {
    throw new Error("JWT payload segment is required.");
  }

  const normalized = payload.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);

  return JSON.parse(atob(padded)) as Record<string, unknown>;
}

export async function assertRejectsDeepLinking(
  run: () => Promise<unknown>,
  message: string,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    assertEquals(error instanceof Error, true);
    assertEquals((error as Error).message, message);
    return;
  }

  throw new Error("Expected Deep Linking validation to reject.");
}
