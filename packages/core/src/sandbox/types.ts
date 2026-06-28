export type EvalEnvironmentId = "sandbox" | "localenv" | "container" | "diagnostic";

export type SandboxProviderId =
  | "soft-workspace"
  | "bwrap"
  | "seatbelt"
  | "docker"
  | "podman";

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

export interface PreflightCheck {
  name: string;
  found: boolean;
  path?: string;
  version?: string;
}

export interface PreflightResult {
  providerId: SandboxProviderId;
  environmentId: EvalEnvironmentId;
  path: string;
  checks: PreflightCheck[];
  allFound: boolean;
  startedAt: string;
  finishedAt: string;
  error?: string;
}

export interface SandboxProvider {
  id: SandboxProviderId;
  canRun(): Promise<SandboxCapabilities>;
  run(input: SandboxCommand): Promise<SandboxResult>;
  runPreflight?(environmentId: EvalEnvironmentId): Promise<PreflightResult>;
}
