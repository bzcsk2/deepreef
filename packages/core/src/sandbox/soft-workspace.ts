import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { relative, isAbsolute } from "node:path";
import type { SandboxProvider, SandboxCommand, SandboxResult, SandboxCapabilities } from "./types";

/**
 * SoftWorkspaceProvider — 轻量工作区隔离（非安全沙箱）。
 * 提供基本的 cwd 包含检测和以工作区为 HOME 的环境隔离。
 * 不提供 OS 级安全边界，仅适用于诊断和开发测试。
 */
export class SoftWorkspaceProvider implements SandboxProvider {
  id = "soft-workspace" as const;

  async canRun(): Promise<SandboxCapabilities> {
    return {
      available: true,
      official: false,
      providerId: "soft-workspace",
      reason:
        "soft-workspace: directory isolation with cwd containment against read/write roots. " +
        "NOT an OS-level sandbox — provides no security boundary. " +
        "Scores are diagnostic only.",
    };
  }

  /**
   * 验证 cwd 在至少一个允许根目录下，否则抛出错误。
   * 使用 path.relative 而非 startsWith 来避免路径边界误判（如 /tmp/work2 误认为属于 /tmp/work）。
   */
  private resolveContainedCwd(cwd: string, allowRoots: string[]): string {
    if (allowRoots.length === 0) return cwd;

    const resolved = resolveReal(cwd);
    for (const root of allowRoots) {
      const resolvedRoot = resolveReal(root);
      const rel = relative(resolvedRoot, resolved);
      if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
        return resolved;
      }
    }
    throw new SandboxCwdError(
      `cwd ${cwd} is outside all allowed roots: ${allowRoots.join(", ")}`
    );
  }

  async run(input: SandboxCommand): Promise<SandboxResult> {
    const timeout = input.timeoutMs ?? 60_000;
    const allRoots = [...(input.readRoots ?? []), ...(input.writeRoots ?? [])];
    let safeCwd: string;
    try {
      safeCwd = this.resolveContainedCwd(input.cwd, allRoots);
    } catch (e) {
      return {
        stdout: "",
        stderr: e instanceof Error ? e.message : String(e),
        exitCode: 1,
        timedOut: false,
      };
    }

    try {
      const result = spawnSync(input.command, [], {
        cwd: safeCwd,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
        timeout,
        stdio: "pipe",
        shell: true,
        env: {
          ...process.env,
          ...input.env,
          HOME: safeCwd,
        },
      });
      return {
        stdout: result.stdout?.toString() ?? "",
        stderr: result.stderr?.toString() ?? "",
        exitCode: result.status ?? 1,
        timedOut: result.error?.message?.includes("timed out") ?? false,
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

export class SandboxCwdError extends Error {
  readonly path: string;
  constructor(message: string) {
    super(message);
    this.name = "SandboxCwdError";
    this.path = message;
  }
}

function resolveReal(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    // 路径不存在时取最近存在的父目录
    const parts = p.replace(/\\/g, "/").split("/").filter(Boolean);
    for (let i = parts.length; i > 0; i--) {
      const candidate = "/" + parts.slice(0, i).join("/");
      try {
        return realpathSync(candidate);
      } catch {
        continue;
      }
    }
    return p;
  }
}
