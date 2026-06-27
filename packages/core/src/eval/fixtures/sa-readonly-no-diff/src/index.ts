// Main module

export interface Config {
  host: string;
  port: number;
  debug: boolean;
}

export function createConfig(overrides?: Partial<Config>): Config {
  return {
    host: "localhost",
    port: 8080,
    debug: false,
    ...overrides,
  };
}

export function validateConfig(config: Config): string[] {
  const errors: string[] = [];
  if (!config.host) errors.push("host is required");
  if (config.port < 0 || config.port > 65535) errors.push("port out of range");
  return errors;
}

// TODO: This function has a potential issue - it doesn't validate input
export function mergeConfig(base: Config, override: Partial<Config>): Config {
  return { ...base, ...override };
}
