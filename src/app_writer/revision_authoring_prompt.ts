import type { PackageVersionRecord } from '../package_review/types.ts';

export function buildRevisionAuthoringPrompt(input: {
  packageVersion: PackageVersionRecord;
  targetVersion: string;
}): string {
  const packageVersion = input.packageVersion;
  const appPlan = {
    appId: packageVersion.appId,
    sourceVersion: packageVersion.version,
    targetVersion: input.targetVersion,
    title: packageVersion.title,
    description: packageVersion.description,
    entrypoint: packageVersion.entrypoint,
    roles: packageVersion.roles,
    installScope: packageVersion.installScope,
    grading: packageVersion.grading,
    capabilities: packageVersion.capabilities,
    manifest: packageVersion.manifestJson,
    runtimeContract: packageVersion.runtimeContract,
  };

  return [
    `Revise the reviewed Lantern learning app "${packageVersion.title}".`,
    '',
    'Use this exact app plan and reviewed runtime capability contract. Keep the app inside Lantern: no LMS tokens, no direct database access, no arbitrary outbound HTTP, and no direct grade writes.',
    '',
    'Do not add or remove runtime capabilities unless the requested change explicitly requires a reviewable capability change.',
    '',
    '```json',
    JSON.stringify(appPlan, null, 2),
    '```',
    '',
    'Requested change:',
    '- ',
  ].join('\n');
}
