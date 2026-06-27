import { execSync } from "node:child_process";
import type { SandboxProvider, SandboxCommand, SandboxResult, SandboxCapabilities } from "./types";

export class SoftWorkspaceProvider implements SandboxProvider {
  id = "soft-workspace" as const;

  async canRun(): Promise<SandboxCapabilities> {
    return {
      available: true,
      official: false,
      providerId: "soft-workspace",
      reason: "soft-workspace: directory isolation without OS-level sandbox. Scores are diagnostic only.",
    };
  }

  async run(input: SandboxCommand): Promise<SandboxResult> {
    const timeout = input.timeoutMs ?? 60_000;
    try {
      const output = execSync(input.command, {
        cwd: input.cwd,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
        timeout,
        stdio: "pipe",
        env: {
          ...process.env,
          ...input.env,
          HOME: input.cwd,
        },
      });
      return {
        stdout: output?.toString() ?? "",
        stderr: "",
        exitCode: 0,
        timedOut: false,
      };
    } catch (err: unknown) {
      const error = err as Error & { stdout?: string; stderr?: string; status?: number; killed?: boolean; signal?: string };
      return {
        stdout: error.stdout ?? "",
        stderr: error.stderr ?? "",
        exitCode: error.status ?? 1,
        timedOut: !!(error.killed || error.signal === "SIGTERM"),
      };
    }
  }
}
