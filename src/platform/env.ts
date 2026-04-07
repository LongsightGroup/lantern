export interface EnvReader {
  get(name: string): string | undefined;
}

const EMPTY_ENV: EnvReader = {
  get(_name: string): string | undefined {
    return;
  },
};

let defaultEnvReader: EnvReader = EMPTY_ENV;

export function getDefaultEnvReader(): EnvReader {
  return defaultEnvReader;
}

export function setDefaultEnvReader(env: EnvReader): void {
  defaultEnvReader = env;
}

export function createObjectEnvReader(bindings: Record<string, unknown>): EnvReader {
  return {
    get(name: string) {
      const value = bindings[name];

      return typeof value === 'string' ? value : undefined;
    },
  };
}

export function readEnv(name: string, env: EnvReader = getDefaultEnvReader()): string | undefined {
  return env.get(name);
}
