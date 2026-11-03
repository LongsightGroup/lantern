import { type EnvReader, setDefaultEnvReader } from './env.ts';

const NODE_ENV_READER: EnvReader = {
  get(name: string): string | undefined {
    return process.env[name] ?? undefined;
  },
};

export function getNodeEnvReader(): EnvReader {
  return NODE_ENV_READER;
}

export function installNodeEnvReader(): void {
  setDefaultEnvReader(NODE_ENV_READER);
}
