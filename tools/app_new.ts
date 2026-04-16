import {
  listScaffoldStarters,
  scaffoldLocalAppPackage,
  type ScaffoldStarterId,
} from '../src/authoring/scaffold.ts';

try {
  const args = readArgs(Deno.args);

  if (args.listStarters) {
    printStarterList();

    if (args.outputRoot === null) {
      Deno.exit(0);
    }
  }

  if (
    args.outputRoot === null ||
    args.starter === null ||
    args.appId === null ||
    args.title === null
  ) {
    throw new Error(buildUsageMessage());
  }

  const scaffoldInput = {
    starter: args.starter,
    outputRoot: args.outputRoot,
    appId: args.appId,
    title: args.title,
    ...(args.ownerId === null ? {} : { ownerId: args.ownerId }),
  };
  const result = await scaffoldLocalAppPackage(scaffoldInput);

  console.log(`Created ${result.starter.id} package at ${result.outputRoot}`);
  console.log(`- Starter: ${result.starter.label}`);
  console.log(`- Next: deno task app:validate ${args.outputRoot}`);
  console.log(`- Next: deno task app:test-preview ${args.outputRoot}`);
  console.log(`- Next: deno task app:preview ${args.outputRoot}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Lantern app scaffolding failed.');
  Deno.exit(1);
}

interface AppNewArgs {
  outputRoot: string | null;
  starter: ScaffoldStarterId | null;
  appId: string | null;
  title: string | null;
  ownerId: string | null;
  listStarters: boolean;
}

function readArgs(args: string[]): AppNewArgs {
  const parsed: AppNewArgs = {
    outputRoot: null,
    starter: null,
    appId: null,
    title: null,
    ownerId: null,
    listStarters: false,
  };

  for (const arg of args) {
    if (arg === '--list-starters') {
      parsed.listStarters = true;
      continue;
    }

    if (arg.startsWith('--starter=')) {
      parsed.starter = arg.slice('--starter='.length) as ScaffoldStarterId;
      continue;
    }

    if (arg.startsWith('--app-id=')) {
      parsed.appId = arg.slice('--app-id='.length);
      continue;
    }

    if (arg.startsWith('--title=')) {
      parsed.title = arg.slice('--title='.length);
      continue;
    }

    if (arg.startsWith('--owner-id=')) {
      parsed.ownerId = arg.slice('--owner-id='.length);
      continue;
    }

    if (arg.startsWith('--')) {
      throw new Error(`Unsupported argument: ${arg}\n\n${buildUsageMessage()}`);
    }

    if (parsed.outputRoot === null) {
      parsed.outputRoot = arg;
      continue;
    }

    throw new Error(`Unexpected positional argument: ${arg}\n\n${buildUsageMessage()}`);
  }

  return parsed;
}

function printStarterList(): void {
  console.log('Available starters:');

  for (const starter of listScaffoldStarters()) {
    console.log(`- ${starter.id}: ${starter.description}`);
  }
}

function buildUsageMessage(): string {
  const starterLines = listScaffoldStarters().map(
    (starter) => `- ${starter.id}: ${starter.description}`,
  );
  const starterSection = starterLines.length > 0 ? ['Available starters:', ...starterLines] : [];

  return [
    'Usage: deno task app:new <output-root> --starter=<id> --app-id=<app-id> --title=<title> [--owner-id=<owner-id>]',
    '',
    ...starterSection,
    '',
    'Optional:',
    '- --list-starters',
  ].join('\n');
}
