import type { SandboxCommand, SandboxResult, SandboxProvider, EvalEnvironmentId } from "./types";
import { detectBestProvider } from "./provider-registry";

export async function execInSandbox(
  command: string,
  cwd: string,
  environmentId: EvalEnvironmentId,
  options?: {
    timeoutMs?: number;
    allowNetwork?: boolean;
    env?: Record<string, string>;
  },
): Promise<SandboxResult> {
  const { provider } = await detectBestProvider(environmentId);
  return execViaProvider(provider, command, cwd, environmentId, options);
}

export async function execViaProvider(
  provider: SandboxProvider,
  command: string,
  cwd: string,
  environmentId: EvalEnvironmentId,
  options?: {
    timeoutMs?: number;
    allowNetwork?: boolean;
    env?: Record<string, string>;
  },
): Promise<SandboxResult> {
  const sandboxCmd: SandboxCommand = {
    command,
    cwd,
    timeoutMs: options?.timeoutMs,
    allowNetwork: options?.allowNetwork,
    env: options?.env,
    readRoots: [cwd],
    writeRoots: [cwd],
  };

  return provider.run(sandboxCmd);
}
