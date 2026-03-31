export function assertPathInsideSnapshot(
  snapshotRoot: string,
  targetPath: string,
  outsideMessage: string,
): void {
  const normalizedRoot = normalizeSnapshotPath(snapshotRoot, outsideMessage);
  const normalizedTarget = normalizeSnapshotPath(targetPath, outsideMessage);

  if (
    normalizedTarget !== normalizedRoot &&
    !normalizedTarget.startsWith(`${normalizedRoot}/`)
  ) {
    throw new Error(outsideMessage);
  }
}

export function ensureLeadingSlash(value: string): string {
  return value.startsWith("/") ? value : `/${value}`;
}

export function joinSnapshotPath(
  snapshotRoot: string,
  relativePath: string,
  outsideMessage: string,
): string {
  const root = normalizeSnapshotPath(snapshotRoot, outsideMessage);
  const relative = normalizeSnapshotPath(relativePath, outsideMessage);

  return relative === "" ? root : `${root}/${relative}`;
}

export function normalizeSnapshotPath(
  path: string,
  outsideMessage: string,
): string {
  const isAbsolute = path.startsWith("/");
  const segments: string[] = [];

  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }

    if (segment === "..") {
      if (segments.length === 0) {
        throw new Error(outsideMessage);
      }

      segments.pop();
      continue;
    }

    segments.push(segment);
  }

  return `${isAbsolute ? "/" : ""}${segments.join("/")}`;
}

export function requireRelativeSnapshotPath(
  relativePath: string,
  message: string,
): string {
  const normalized = normalizeSnapshotPath(relativePath, message);

  if (normalized === "" || normalized.startsWith("/")) {
    throw new Error(message);
  }

  return normalized;
}

export function toRelativeSnapshotPath(
  snapshotRoot: string,
  absolutePath: string,
  outsideMessage: string,
): string {
  const normalizedRoot = normalizeSnapshotPath(snapshotRoot, outsideMessage);
  const normalizedPath = normalizeSnapshotPath(absolutePath, outsideMessage);

  if (normalizedPath === normalizedRoot) {
    return "";
  }

  if (!normalizedPath.startsWith(`${normalizedRoot}/`)) {
    throw new Error(outsideMessage);
  }

  return normalizedPath.slice(normalizedRoot.length + 1);
}

export function trimLeadingSlash(value: string): string {
  return value.startsWith("/") ? value.slice(1) : value;
}
