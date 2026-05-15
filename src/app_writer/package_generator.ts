import type {
  AppGenerationPlanningResult,
  AppPackageFileGenerationInput,
  AppPackageFileGenerationResult,
  AppPackageGenerationInput,
  AppPackageGenerationResult,
  AppPackageRepairInput,
} from './types.ts';

export interface AppPackageGenerator {
  generate(input: AppPackageGenerationInput): Promise<AppPackageGenerationResult>;
  repair?(input: AppPackageRepairInput): Promise<AppPackageGenerationResult>;
  plan?(input: AppPackageGenerationInput): Promise<AppGenerationPlanningResult>;
  generateFiles?(input: AppPackageFileGenerationInput): Promise<AppPackageFileGenerationResult>;
}

export function createFakeAppPackageGenerator(
  result: AppPackageGenerationResult,
): AppPackageGenerator {
  return {
    generate(_input) {
      return Promise.resolve(structuredClone(result));
    },
  };
}

export function createFakeRepairingAppPackageGenerator(
  initialResult: AppPackageGenerationResult,
  repairResults: readonly AppPackageGenerationResult[],
): AppPackageGenerator {
  const remainingRepairs = repairResults.map((result) => structuredClone(result));

  return {
    generate(_input) {
      return Promise.resolve(structuredClone(initialResult));
    },
    repair(_input) {
      const nextRepair = remainingRepairs.shift();

      if (nextRepair === undefined) {
        return Promise.reject(new Error('Fake app package generator has no repair result.'));
      }

      return Promise.resolve(structuredClone(nextRepair));
    },
  };
}

export function createUnavailableAppPackageGenerator(
  message = APP_PACKAGE_GENERATOR_UNAVAILABLE_MESSAGE,
): AppPackageGenerator {
  return {
    generate(_input) {
      return Promise.reject(new Error(message));
    },
  };
}

export const APP_PACKAGE_GENERATOR_UNAVAILABLE_MESSAGE =
  'Lantern app package generation is not configured. Bind a server-owned app package generator before using AI app writing.';
