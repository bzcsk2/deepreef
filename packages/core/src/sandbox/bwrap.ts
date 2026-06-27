import { execSync, execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { resolveBundledBwrap } from "./bundled-bwrap";
import type { SandboxProvider, SandboxCommand, SandboxResult, SandboxCapabilities } from "./types";

const SYSTEM_DIRS = ["/usr", "/bin", "/lib", "/lib64"];

const ETC_FILES = ["/etc/passwd", "/etc/group", "/etc/nsswitch.conf", "/etc/resolv.conf", "/etc/hosts", "/etc/hostname"];

function getEssentialDirs(): string[] {
  const dirs = SYSTEM_DIRS.filter((d) => existsSync(d));
  try {
    const nodeBin = realpathSync(process.execPath);
    const nodeDir = dirname(nodeBin);
    if (nodeDir !== "/usr/bin" && nodeDir !== "/bin") {
      const add = resolve(nodeDir, "..");
      if (!dirs.includes(add)) dirs.push(add);
    }
  } catch {}
  return dirs;
}

function getEssentialFiles(): string[] {
  return ETC_FILES.filter((f) => existsSync(f));
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

  async run(input: SandboxCommand): Promise<SandboxResult> {
    const bwrap = this.findBwrap();
    if (!bwrap) {
      return { stdout: "", stderr: "bwrap not available", exitCode: 1, timedOut: false };
    }

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
    args.push("--unsetenv", "DBUS_SESSION_BUS_ADDRESS");
    args.push("--unsetenv", "DISPLAY");
    args.push("--unsetenv", "WAYLAND_DISPLAY");
    args.push("--unsetenv", "SESSION_MANAGER");

    if (input.env) {
      for (const [key, value] of Object.entries(input.env)) {
        args.push("--setenv", key, value);
      }
    }

    args.push("sh", "-c", input.command);

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
}
