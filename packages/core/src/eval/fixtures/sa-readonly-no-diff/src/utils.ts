// Utility functions

export function formatConfig(config: { host: string; port: number }): string {
  return `${config.host}:${config.port}`;
}

export function isLocalhost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}
