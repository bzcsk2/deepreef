import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
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
   * 验证 cwd 在至少一个允许根目录下，否则回退到最近的允许根目录。
   */
  private resolveContainedCwd(cwd: string, allowRoots: string[]): string {
    // 如果允许根目录列表为空，使用 cwd 原值（兼容旧行为）
    if (allowRoots.length === 0) return cwd;

    const resolved = resolveReal(cwd);
    for (const root of allowRoots) {
      const resolvedRoot = resolveReal(root);
      if (resolved.startsWith(resolvedRoot)) {
        return resolved;
      }
    }
    // 回退到第一个允许根目录
    return resolveReal(allowRoots[0]!);
  }

  async run(input: SandboxCommand): Promise<SandboxResult> {
    const timeout = input.timeoutMs ?? 60_000;
    const allRoots = [...(input.readRoots ?? []), ...(input.writeRoots ?? [])];
    const safeCwd = this.resolveContainedCwd(input.cwd, allRoots);

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
