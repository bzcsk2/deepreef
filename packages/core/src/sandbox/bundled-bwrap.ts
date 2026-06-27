import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

function getPlatform(): string {
  const platform = process.platform;
  if (platform === "linux") return "linux";
  if (platform === "darwin") return "darwin";
  return platform;
}

function getArch(): string {
  const arch: string = process.arch;
  if (arch === "x64") return "x64";
  if (arch === "arm64" || arch === "aarch64") return "arm64";
  return arch;
}

export function resolveBundledBwrap(): string | null {
  const platform = getPlatform();
  const arch = getArch();

  if (platform !== "linux") return null;

  const scriptDir = import.meta.dirname ?? process.cwd();

  const candidates = [
    // Published package layout: resources/ at package root, sibling of dist/
    resolve(scriptDir, "..", "resources", "bwrap", `linux-${arch}`, "bwrap"),
    // Source tree layout: packages/core/src/sandbox/ → resources/bwrap/...
    resolve(scriptDir, "..", "..", "..", "..", "resources", "bwrap", `linux-${arch}`, "bwrap"),
  ];

  for (const path of candidates) {
    if (existsSync(path)) return path;
  }

  return null;
}

export function getBwrapDiagnostics(): Record<string, unknown> {
  const platform = getPlatform();
  const arch = getArch();
  const bundled = resolveBundledBwrap();

  let whichResult = "not checked";
  try {
    whichResult = execSync("which bwrap 2>/dev/null || echo not found", { encoding: "utf-8" }).toString().trim();
  } catch {
    whichResult = "error";
  }

  return {
    platform,
    arch,
    systemBwrap: whichResult,
    bundledPath: bundled,
    bundledExists: bundled ? existsSync(bundled) : false,
  };
}
