import { type EnvReader, setDefaultEnvReader } from './env.ts';

const DENO_ENV_READER: EnvReader = {
  get(name: string): string | undefined {
    return Deno.env.get(name) ?? undefined;
  },
};

export function getDenoEnvReader(): EnvReader {
  return DENO_ENV_READER;
}

export function installDenoEnvReader(): void {
  setDefaultEnvReader(DENO_ENV_READER);
}
