type BrowserAutograderContract = {
  kind: 'browser_autograder';
  paths: string[];
};

export function normalizeAuthoringDraftPath(path: string): string {
  const trimmed = path.trim();

  if (trimmed === '') {
    throw new Error('Authoring draft file paths cannot be blank.');
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function readBrowserAutograderContract(
  manifestJson: Record<string, unknown>,
): BrowserAutograderContract {
  const authoring = requireRecord(
    manifestJson.authoring,
    'Lantern authoring requires manifest.authoring for browser autograder packages.',
  );
  const kind = requireString(authoring.kind, 'Lantern authoring requires manifest.authoring.kind.');

  if (kind !== 'browser_autograder') {
    throw new Error(
      `Lantern authoring requires manifest.authoring.kind = "browser_autograder". Found ${kind}.`,
    );
  }

  const graderSpecFiles = requireStringArray(
    authoring.grader_spec_files,
    'Lantern authoring requires manifest.authoring.grader_spec_files.',
  ).map(normalizeAuthoringDraftPath);
  const evidenceExampleFile = normalizeAuthoringDraftPath(
    requireString(
      authoring.evidence_example_file,
      'Lantern authoring requires manifest.authoring.evidence_example_file.',
    ),
  );

  return {
    kind,
    paths: [...new Set([...graderSpecFiles, evidenceExampleFile])],
  };
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(message);
  }

  return value as Record<string, unknown>;
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(message);
  }

  return value.trim();
}

function requireStringArray(value: unknown, message: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(message);
  }

  return value.map((item) => requireString(item, message));
}
