export function toFinalizeError(error: unknown): Error {
  if (error instanceof Error && error.message.startsWith("Finalize ")) {
    return error;
  }

  return new Error(`Finalize blocked: ${errorMessage(error)}`);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown finalize error.";
}
