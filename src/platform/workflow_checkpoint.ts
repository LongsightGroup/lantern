/** Validate a JSON-shaped workflow record before it crosses a durable checkpoint. */
export function workflowCheckpoint<T>(value: T): T & Rpc.Serializable<T> {
  assertCheckpointValue(value);
  // SAFETY: The recursive boundary check permits only plain JSON-shaped data
  // and undefined, all of which the Workers checkpoint serializer supports.
  return value as T & Rpc.Serializable<T>;
}

function assertCheckpointValue(value: unknown): void {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  )
    return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    for (const item of value) assertCheckpointValue(item);
    return;
  }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    for (const item of Object.values(value)) assertCheckpointValue(item);
    return;
  }
  throw new Error('Workflow checkpoints must contain plain JSON data.');
}
