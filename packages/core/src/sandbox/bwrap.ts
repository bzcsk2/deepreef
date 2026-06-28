import { execSync, execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { resolveBundledBwrap } from "./bundled-bwrap";
import type { SandboxProvider, SandboxCommand, SandboxResult, SandboxCapabilities, PreflightResult, PreflightCheck, EvalEnvironmentId } from "./types";

const SYSTEM_DIRS = ["/usr", "/bin", "/lib", "/lib64"];

const ETC_FILES = ["/etc/passwd", "/etc/group", "/etc/nsswitch.conf", "/etc/resolv.conf", "/etc/hosts", "/etc/hostname"];

const TOOL_NAMES = ["sh", "node", "bun", "python3", "pytest"];

function getEssentialDirs(): string[] {
  const dirs = new Set(SYSTEM_DIRS.filter((d) => existsSync(d)));
  for (const dir of getToolDirs()) {
    dirs.add(dir);
  }
  return Array.from(dirs);
}

function getToolDirs(): string[] {
  const dirs = new Set<string>();
  for (const name of TOOL_NAMES) {
    const hostPath = findToolPath(name);
    if (hostPath) {
      const dir = dirname(hostPath);
      if (dir !== "/usr/bin" && dir !== "/bin") {
        dirs.add(dir);
      }
    }
  }
  try {
    const nodeBin = realpathSync(process.execPath);
    const nodeDir = dirname(nodeBin);
    if (nodeDir !== "/usr/bin" && nodeDir !== "/bin") {
      const parent = resolve(nodeDir, "..");
      if (!dirs.has(parent)) {
        const nonUsrParent = resolve(nodeDir, "..");
        dirs.add(nodeDir);
        const parentDir = dirname(nodeDir);
        if (parentDir !== "/usr/bin" && parentDir !== "/bin" && parentDir !== "/usr") {
          dirs.add(parentDir);
        }
      }
    }
  } catch {}
  return Array.from(dirs);
}

function getEssentialFiles(): string[] {
  return ETC_FILES.filter((f) => existsSync(f));
}

function findToolPath(name: string): string | null {
  try {
    const which = process.env.SHELL
      ? execSync(`which ${name} 2>/dev/null`, { encoding: "utf-8", stdio: "pipe" }).toString().trim()
      : execSync(`command -v ${name} 2>/dev/null`, { encoding: "utf-8", stdio: "pipe" }).toString().trim();
    return which || null;
  } catch {
    return null;
  }
}

function getToolVersion(path: string): string | null {
  try {
    return execSync(`${path} --version 2>&1`, { encoding: "utf-8", stdio: "pipe", timeout: 5000 }).toString().trim().split("\n")[0] ?? null;
  } catch {
    return null;
  }
}

function getSandboxPath(): string {
  const basePath = "/usr/bin:/bin";
  const toolDirs = new Set<string>();
  for (const name of ["node", "bun", "python3", "pytest"]) {
    const hostPath = findToolPath(name);
    if (hostPath) {
      const dir = dirname(hostPath);
      toolDirs.add(dir);
    }
  }
  const extra = Array.from(toolDirs).filter(d => d !== "/usr/bin" && d !== "/bin");
  if (extra.length === 0) return basePath;
  return [...extra, basePath].join(":");
}



export class BwrapProvider implements SandboxProvider {
  id = "bwrap" as const;
  private bwrapPath: string | null = null;

  private findBwrap(): string | null {
    if (this.bwrapPath) return this.bwrapPath;

    try {
      const which = execSync("which bwrap 2>/dev/null", { encoding: "utf-8", stdio: "pipe" }).toString().trim();
      if (which && existsSync(which)) {
        this.bwrapPath = which;
        return this.bwrapPath;
      }
    } catch {}

    const bundled = resolveBundledBwrap();
    if (bundled && existsSync(bundled)) {
      this.bwrapPath = bundled;
      return this.bwrapPath;
    }

    return null;
  }

  async canRun(): Promise<SandboxCapabilities> {
    const bwrap = this.findBwrap();
    if (!bwrap) {
      return {
        available: false,
        official: false,
        providerId: "bwrap",
        reason: `bwrap not found: system PATH and bundled (${resolveBundledBwrap() ?? "N/A"}) both unavailable`,
      };
    }

    try {
      execFileSync(bwrap, ["--version"], { encoding: "utf-8", stdio: "pipe" });
      return {
        available: true,
        official: true,
        providerId: "bwrap",
      };
    } catch {
      return {
        available: false,
        official: false,
        providerId: "bwrap",
        reason: `bwrap found at ${bwrap} but failed to execute`,
      };
    }
  }

  private buildArgs(input: SandboxCommand): string[] {
    const args: string[] = [
      "--unshare-all",
      "--new-session",
      "--die-with-parent",
      "--tmpfs", "/tmp",
      "--proc", "/proc",
      "--dev", "/dev",
      "--chdir", input.cwd,
    ];

    for (const dir of getEssentialDirs()) {
      args.push("--ro-bind", dir, dir);
    }
    for (const file of getEssentialFiles()) {
      args.push("--ro-bind", file, file);
    }

    for (const dir of input.readRoots) {
      args.push("--ro-bind", dir, dir);
    }

    for (const dir of input.writeRoots) {
      args.push("--bind", dir, dir);
    }

    if (input.readonlyRoots) {
      for (const dir of input.readonlyRoots) {
        args.push("--ro-bind", dir, dir);
      }
    }

    if (!input.allowNetwork) {
      args.push("--unshare-net");
    }

    args.push("--setenv", "HOME", input.cwd);
    args.push("--setenv", "PATH", getSandboxPath());
    args.push("--unsetenv", "DBUS_SESSION_BUS_ADDRESS");
    args.push("--unsetenv", "DISPLAY");
    args.push("--unsetenv", "WAYLAND_DISPLAY");
    args.push("--unsetenv", "SESSION_MANAGER");

    if (input.env) {
      for (const [key, value] of Object.entries(input.env)) {
        args.push("--setenv", key, value);
      }
    }
    return args;
  }

  async run(input: SandboxCommand): Promise<SandboxResult> {
    const bwrap = this.findBwrap();
    if (!bwrap) {
      return { stdout: "", stderr: "bwrap not available", exitCode: 1, timedOut: false };
    }

    const args = [...this.buildArgs(input), "sh", "-c", input.command];

    const timeout = input.timeoutMs ?? 60_000;

    try {
      const output = execFileSync(bwrap, args, {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
        timeout,
        stdio: "pipe",
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

  async runPreflight(environmentId: EvalEnvironmentId): Promise<PreflightResult> {
    const startedAt = new Date().toISOString();
    const sandboxPath = getSandboxPath();
    const toolNames = ["sh", "node", "bun", "python3", "pytest"];

    try {
      const bwrap = this.findBwrap();
      if (!bwrap) {
        return {
          providerId: "bwrap",
          environmentId,
          path: sandboxPath,
          checks: toolNames.map(name => ({ name, found: false })),
          allFound: false,
          startedAt,
          finishedAt: new Date().toISOString(),
          error: "bwrap binary not found",
        };
      }

      const checks: PreflightCheck[] = [];
      for (const name of toolNames) {
        const whichCmd = `command -v ${name} 2>/dev/null && (${name} --version 2>/dev/null | head -1) || echo 'NOT_FOUND'`;
        const args = [...this.buildArgs({
          command: whichCmd,
          cwd: "/tmp",
          readRoots: [],
          writeRoots: [],
          timeoutMs: 10_000,
          allowNetwork: false,
        }), "sh", "-c", whichCmd];

        try {
          const output = execFileSync(bwrap, args, {
            encoding: "utf-8",
            maxBuffer: 1024 * 1024,
            timeout: 10_000,
            stdio: "pipe",
          }).toString().trim();

          const lines = output.split("\n").filter(Boolean);
          if (lines.length === 0 || lines[lines.length - 1] === "NOT_FOUND") {
            checks.push({ name, found: false });
          } else {
            const toolPath = lines[0] ?? "";
            const version = lines.length > 1 ? lines[lines.length - 1] : undefined;
            checks.push({ name, found: true, path: toolPath, version });
          }
        } catch {
          checks.push({ name, found: false });
        }
      }

      const allFound = checks.every(c => c.found);
      return {
        providerId: "bwrap",
        environmentId,
        path: sandboxPath,
        checks,
        allFound,
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    } catch (err) {
      return {
        providerId: "bwrap",
        environmentId,
        path: sandboxPath,
        checks: [],
        allFound: false,
        startedAt,
        finishedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export { getEssentialDirs, getEssentialFiles, getSandboxPath, getToolDirs };
