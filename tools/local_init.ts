import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  appendMissingEnvAssignments,
  createLocalBetterAuthSecret,
  createLocalLtiStateSecret,
  createLocalToolPrivateJwkString,
  DEFAULT_LOCAL_ENV_PATH,
  defaultLocalEnvAssignments,
} from './local_support.ts';

const LOCAL_DIRECTORIES = ['var/packages', 'var/attempt-evidence', 'var/authoring-drafts'] as const;

if (import.meta.main) {
  const outputPath = readOutputPath(process.argv.slice(2)) ?? DEFAULT_LOCAL_ENV_PATH;
  const existingText = await readOptionalTextFile(outputPath);
  const assignments = defaultLocalEnvAssignments();
  const generatedJwk = await createLocalToolPrivateJwkString();
  const next = appendMissingEnvAssignments({
    existingText,
    assignments: {
      ...assignments,
      BETTER_AUTH_SECRET: createLocalBetterAuthSecret(),
      LTI_STATE_SECRET: createLocalLtiStateSecret(),
      LTI_TOOL_PRIVATE_JWK: generatedJwk,
    },
  });

  await writeFile(outputPath, next.text);

  for (const path of LOCAL_DIRECTORIES) {
    await mkdir(path, { recursive: true });
  }

  console.log(
    next.created
      ? `Created ${outputPath} for local Lantern development.`
      : `Updated ${outputPath} with any missing local Lantern defaults.`,
  );

  if (next.addedKeys.length > 0) {
    console.log(`Added: ${next.addedKeys.join(', ')}`);
  } else {
    console.log('No new keys were needed.');
  }

  console.log('');
  console.log('Next:');
  console.log('1. Run `npm run local:bootstrap` to apply local D1 migrations.');
  console.log('2. Run `npm run local:start` and open the Cloudflare Vite localhost URL.');
}

function readOutputPath(args: string[]): string | null {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === '--output') {
      return args[index + 1] ?? null;
    }

    if (argument?.startsWith('--output=')) {
      return argument.slice('--output='.length);
    }
  }

  return null;
}

async function readOptionalTextFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}
