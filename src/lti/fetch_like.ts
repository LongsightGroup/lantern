export interface FetchLike {
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export async function performFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  fetchOverride?: FetchLike,
): Promise<Response> {
  if (fetchOverride !== undefined) {
    return await fetchOverride(input, init);
  }

  return await globalThis.fetch(input, init);
}
