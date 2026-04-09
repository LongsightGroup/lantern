import {
  appendMissingEnvAssignments,
  createLocalToolPrivateJwkString,
  defaultLocalEnvAssignments,
  DEFAULT_LOCAL_ENV_PATH,
} from './local_support.ts';

const LOCAL_DIRECTORIES = ['var/packages', 'var/attempt-evidence', 'var/authoring-drafts'] as const;

if (import.meta.main) {
  const outputPath = readOutputPath(Deno.args) ?? DEFAULT_LOCAL_ENV_PATH;
  const existingText = await readOptionalTextFile(outputPath);
  const assignments = defaultLocalEnvAssignments();
  const generatedJwk = await createLocalToolPrivateJwkString();
  const next = appendMissingEnvAssignments({
    existingText,
    assignments: {
      ...assignments,
      LTI_TOOL_PRIVATE_JWK: generatedJwk,
    },
  });

  await Deno.writeTextFile(outputPath, next.text);

  for (const path of LOCAL_DIRECTORIES) {
    await Deno.mkdir(path, { recursive: true });
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
  console.log('1. Create a local Postgres database named `lantern` if you do not have one yet.');
  console.log(
    `2. Edit ${outputPath} if your DATABASE_URL should use a different host, user, password, or database.`,
  );
  console.log('3. Run `deno task local:bootstrap`.');
  console.log('4. Run `deno task local:start` and open http://localhost:8417/admin/packages.');
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
    return await Deno.readTextFile(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return null;
    }

    throw error;
  }
}
