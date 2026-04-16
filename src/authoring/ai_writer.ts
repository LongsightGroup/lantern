export interface AuthoringDraftFileInput {
  path: string;
  contents: string;
}

export interface AuthoringReferenceExample {
  appId: string;
  files: AuthoringDraftFileInput[];
}

export interface AuthoringAiWriter {
  generate(input: {
    appId: string;
    packageVersion: string;
    prompt: string;
    currentFiles: AuthoringDraftFileInput[];
    referenceExamples: AuthoringReferenceExample[];
  }): Promise<{
    files: AuthoringDraftFileInput[];
    notes: string[];
  }>;
}

export const AUTHORING_AI_UNCONFIGURED_MESSAGE =
  'AI assist is not configured for this Lantern environment.';

export function createUnavailableAuthoringAiWriter(): AuthoringAiWriter {
  return {
    generate() {
      return Promise.reject(new Error(AUTHORING_AI_UNCONFIGURED_MESSAGE));
    },
  };
}
