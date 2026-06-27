export type EvalEnvironmentId = "sandbox" | "localenv" | "container";

export type SandboxProviderId =
  | "soft-workspace"
  | "bwrap"
  | "seatbelt"
  | "docker";

export interface SandboxCapabilities {
  available: boolean;
  official: boolean;
  providerId: SandboxProviderId;
  reason?: string;
}

export interface SandboxCommand {
  command: string;
  cwd: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  allowNetwork?: boolean;
  readRoots: string[];
  writeRoots: string[];
  readonlyRoots?: string[];
}

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

export interface SandboxProvider {
  id: SandboxProviderId;
  canRun(): Promise<SandboxCapabilities>;
  run(input: SandboxCommand): Promise<SandboxResult>;
}
