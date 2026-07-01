import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";

const TEST_DIR = join(tmpdir(), `swe-snapshot-test-${randomUUID()}`);
const SNAPSHOTS_DIR = join(TEST_DIR, "swe-bench", "snapshots", "psf_requests");
const WORKSPACE_DIR = join(TEST_DIR, "workspace");
const FAKE_SNAPSHOT_PATH = join(SNAPSHOTS_DIR, "fakecommit.tar.gz");

beforeAll(() => {
  mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  mkdirSync(WORKSPACE_DIR, { recursive: true });

  const staging = join(TEST_DIR, "staging");
  mkdirSync(join(staging, "src"), { recursive: true });
  mkdirSync(join(staging, "tests"), { recursive: true });
  writeFileSync(join(staging, "src", "lib.py"), "x = 1");
  writeFileSync(join(staging, "tests", "test_lib.py"), "def test_x(): assert True");

  execSync(
    `tar --sort=name --mtime='UTC 2020-01-01' --owner=0 --group=0 --numeric-owner -czf "${FAKE_SNAPSHOT_PATH}" -C "${staging}" .`,
    { stdio: "pipe", timeout: 15000 },
  );
});

afterAll(() => {
  execSync(`rm -rf "${TEST_DIR}"`, { stdio: "pipe" });
});

describe("swe-bench-snapshot", () => {
  test("extractSafeTarGz extracts to workspace", async () => {
    const { extractSafeTarGz } = await import("../../assets/extract-safe");
    const ws = join(TEST_DIR, "extract-test");
    mkdirSync(ws, { recursive: true });

    await extractSafeTarGz(FAKE_SNAPSHOT_PATH, ws);
    expect(existsSync(join(ws, "src", "lib.py"))).toBe(true);
    expect(existsSync(join(ws, "tests", "test_lib.py"))).toBe(true);
    expect(readFileSync(join(ws, "src", "lib.py"), "utf-8")).toBe("x = 1");
  });

  test("extractSafeTarGz rejects tar entry with ..", async () => {
    const maliciousTar = join(TEST_DIR, "malicious.tar.gz");
    const staging = join(TEST_DIR, "mal-staging");
    mkdirSync(staging, { recursive: true });
    writeFileSync(join(staging, "test.txt"), "data");

    execSync(
      `cd "${staging}" && tar -czf "${maliciousTar}" --transform='s|test.txt|../../etc/passwd|' test.txt 2>/dev/null || true`,
      { stdio: "pipe", timeout: 15000 },
    );

    const { extractSafeTarGz } = await import("../../assets/extract-safe");
    const ws = join(TEST_DIR, "mal-ws");
    mkdirSync(ws, { recursive: true });

    try {
      await extractSafeTarGz(maliciousTar, ws);
      expect(true).toBe(false); // should not reach here
    } catch (e) {
      expect((e as Error).message).toContain("..");
    }
  });

  test("extractSafeTarGz rejects absolute path in tar", async () => {
    const { extractSafeTarGz } = await import("../../assets/extract-safe");
    const ws = join(TEST_DIR, "abs-ws");
    mkdirSync(ws, { recursive: true });

    const absTar = join(TEST_DIR, "absolute.tar.gz");
    const staging = join(TEST_DIR, "abs-staging");
    mkdirSync(staging, { recursive: true });
    writeFileSync(join(staging, "evil.txt"), "evil");

    execSync(
      `cd "${staging}" && tar -czf "${absTar}" --transform='s|evil.txt|/tmp/evil.txt|' evil.txt 2>/dev/null || true`,
      { stdio: "pipe", timeout: 15000 },
    );

    try {
      await extractSafeTarGz(absTar, ws);
      expect(true).toBe(false);
    } catch (e) {
      expect((e as Error).message).toContain("absolute");
    }
  });

  test("missing snapshot throws MissingEvalAssetError", async () => {
    const { resolveSweBenchSnapshot } = await import("../swe-bench-snapshot");
    try {
      resolveSweBenchSnapshot("nonexistent/repo", "deadbeef");
      expect(true).toBe(false);
    } catch (e) {
      expect((e as Error).name).toBe("MissingEvalAssetError");
    }
  });
});
