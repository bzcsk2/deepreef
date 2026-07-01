import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const TEST_DIR = join(tmpdir(), `tb-assets-test-${randomUUID()}`);
const TASKS_DIR = join(TEST_DIR, "terminal-bench", "tasks");

const FAKE_LOCK = {
  version: "1",
  source: {
    kind: "terminal-bench",
    repoPath: ".",
    tasksDir: "terminal-bench-tasks",
    commit: "test",
    datasetName: "terminal-bench-core",
    datasetVersion: "0.1.0",
  },
  instances: [
    { taskId: "hello-world", category: "coding-basics", suite: "standard" },
    { taskId: "fix-permissions", category: "coding-basics", suite: "standard" },
  ],
};

beforeAll(() => {
  mkdirSync(join(TASKS_DIR, "hello-world", "tests"), { recursive: true });
  writeFileSync(join(TASKS_DIR, "hello-world", "task.yaml"), "title: Hello World\ndifficulty: easy\ninstruction: print hello\n");
  writeFileSync(join(TASKS_DIR, "hello-world", "tests", "test_outputs.py"), "def test_hello(): pass");

  mkdirSync(join(TASKS_DIR, "fix-permissions", "tests"), { recursive: true });
  writeFileSync(join(TASKS_DIR, "fix-permissions", "task.yaml"), "title: Fix Permissions\ndifficulty: medium\ninstruction: fix file permissions\n");
  writeFileSync(join(TASKS_DIR, "fix-permissions", "tests", "test_outputs.py"), "def test_perms(): pass");
  writeFileSync(join(TASKS_DIR, "fix-permissions", "setup.sh"), "pip install pytest\n");

  const lockPath = join(TEST_DIR, "terminal-bench", "lock.json");
  writeFileSync(lockPath, JSON.stringify(FAKE_LOCK, null, 2));
});

afterAll(() => {
  import("node:fs").then((fs) => fs.rmSync(TEST_DIR, { recursive: true, force: true }));
});

describe("terminal-bench-assets", () => {
  test("copyToWorkspace copies task files excluding Dockerfile/task.yaml", async () => {
    const { copyToWorkspace } = await import("../shared");

    const taskPath = join(TASKS_DIR, "hello-world");
    const ws = join(TEST_DIR, "ws-copy");
    mkdirSync(ws, { recursive: true });

    const exclude = ["Dockerfile", "docker-compose.yaml", "task.yaml", "solution.sh", "solution.yaml", "run-tests.sh"];
    await copyToWorkspace(taskPath, ws, exclude);

    expect(existsSync(join(ws, "tests", "test_outputs.py"))).toBe(true);
    expect(existsSync(join(ws, "task.yaml"))).toBe(false);
  });

  test("taskPath resolves from LOOPRIG_EVAL_ASSETS_DIR", async () => {
    process.env.LOOPRIG_EVAL_ASSETS_DIR = TEST_DIR;
    try {
      const { getEvalAssetPath } = await import("../../assets/resolve-assets-root");
      const taskYaml = getEvalAssetPath("terminal-bench/tasks/hello-world/task.yaml");
      expect(existsSync(taskYaml)).toBe(true);
    } finally {
      delete process.env.LOOPRIG_EVAL_ASSETS_DIR;
    }
  });

  test("loadTerminalBenchManifests works with env override", async () => {
    process.env.LOOPRIG_EVAL_ASSETS_DIR = TEST_DIR;
    try {
      const { loadTerminalBenchManifests } = await import("../../sources/terminal-bench");
      const manifests = loadTerminalBenchManifests();
      const ids = manifests.map(m => m.id);
      expect(ids).toContain("tb-hello-world");
      expect(ids).toContain("tb-fix-permissions");
      expect(ids).not.toContain("tb-nonexistent-task");
    } finally {
      delete process.env.LOOPRIG_EVAL_ASSETS_DIR;
    }
  });
});
