export interface BrowserAutograderDraftFileInput {
  path: string;
  contents: string;
}

export interface BrowserAutograderDraftReferenceExample {
  appId: string;
  files: BrowserAutograderDraftFileInput[];
}

export interface BrowserAutograderDraftGenerator {
  generate(input: {
    appId: string;
    packageVersion: string;
    prompt: string;
    currentFiles: BrowserAutograderDraftFileInput[];
    referenceExamples: BrowserAutograderDraftReferenceExample[];
  }): Promise<{
    files: BrowserAutograderDraftFileInput[];
    notes: string[];
  }>;
}

export const BROWSER_AUTOGRADER_DRAFT_GENERATOR_UNCONFIGURED_MESSAGE =
  'Browser-autograder draft generation is not configured for this Lantern environment.';

export function createUnavailableBrowserAutograderDraftGenerator(): BrowserAutograderDraftGenerator {
  return {
    generate() {
      return Promise.reject(new Error(BROWSER_AUTOGRADER_DRAFT_GENERATOR_UNCONFIGURED_MESSAGE));
    },
  };
}
