import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import type {
  EvalCategoryId,
  EvalSuiteId,
  EvalCaseManifest,
  FixedEvalOptions,
  CaseResult,
  SuiteSummary,
  VerifierResult,
  ObjectiveSignals,
  CaseScore,
  EvalRunMeta,
  EvalRunReport,
  EvalProgressEvent,
  EvalEnvironmentId,
  SandboxProviderId,
  PreflightResult,
} from "./types";
import { getSuite, getCategories } from "./registry";
import { getManifest } from "./loader";
import { createCaseWorkspace, writeCaseArtifact, getCaseWorkspaceDir, setEvalSandboxProvider, getEvalSandboxProvider } from "./workspace";
import { runVerifier, setSandboxProvider as setVerifierSandboxProvider } from "./verifier";
import { initDefaultProviders, detectBestProvider } from "../sandbox/provider-registry";

let _currentCaseWorkspace: string | null = null;
export function getCurrentCaseWorkspace(): string | null {
  return _currentCaseWorkspace;
}

function getDeepReefRoot(): string {
  return process.env.DEEPRREF_ROOT ?? ".deepreef";
}

function getEvalsDir(): string {
  return join(getDeepReefRoot(), "evals");
}

function getObjectiveSignals(workspaceDir: string): ObjectiveSignals {
  try {
    const diffStat = execSync("git diff --stat 2>&1", {
      cwd: workspaceDir,
      encoding: "utf-8",
      stdio: "pipe",
    }).toString().trim();

    const changedFiles = diffStat ? diffStat.split("\n").length : 0;

    const diffSize = execSync("git diff 2>&1 | wc -l", {
      cwd: workspaceDir,
      encoding: "utf-8",
      stdio: "pipe",
    }).toString().trim();

    const cleanGitDiff = !diffStat;

    return {
      changedFiles,
      diffSize: parseInt(diffSize, 10) || 0,
      toolFailureCount: 0,
      verificationCommandsRun: 0,
      cleanGitDiff,
    };
  } catch {
    return {
      changedFiles: 0,
      diffSize: 0,
      toolFailureCount: 0,
      verificationCommandsRun: 0,
      cleanGitDiff: true,
    };
  }
}

function computeScore(
  verifierResult: VerifierResult | null,
  objectiveSignals: ObjectiveSignals | null,
  supervisorAssessment: Record<string, number> | null,
): CaseScore {
  const VW = 0.7;
  const OW = 0.2;
  const SW = 0.1;

  let verifierScore = 0;
  if (verifierResult) {
    if (verifierResult.verdict === "pass") verifierScore = 100;
    else if (verifierResult.verdict === "error") verifierScore = 0;
    else verifierScore = 0;
  }

  let objectiveScore = 50;
  if (objectiveSignals) {
    objectiveScore = 100;
    if (objectiveSignals.toolFailureCount > 0) {
      objectiveScore -= Math.min(objectiveSignals.toolFailureCount * 10, 50);
    }
    if (!objectiveSignals.cleanGitDiff && objectiveSignals.changedFiles === 0) {
      objectiveScore -= 20;
    }
    objectiveScore = Math.max(0, Math.min(100, objectiveScore));
  }

  let supervisorScore = 50;
  if (supervisorAssessment) {
    const dims = Object.values(supervisorAssessment);
    if (dims.length > 0) {
      supervisorScore = dims.reduce((a, b) => a + b, 0) / dims.length;
    }
  }

  let finalScore =
    verifierScore * VW + objectiveScore * OW + supervisorScore * SW;

  if (verifierResult && verifierResult.verdict === "fail") {
    finalScore = Math.min(finalScore, 40);
  }
  if (verifierResult && verifierResult.verdict === "error") {
    finalScore = 0;
  }

  return {
    verifierWeight: VW,
    objectiveWeight: OW,
    supervisorWeight: SW,
    verifierScore,
    objectiveScore,
    supervisorScore,
    finalScore: Math.round(finalScore * 100) / 100,
  };
}

function getPatchDiff(workspaceDir: string): string {
  try {
    return execSync("git diff 2>&1", {
      cwd: workspaceDir,
      encoding: "utf-8",
      stdio: "pipe",
    }).toString();
  } catch {
    return "";
  }
}

async function resolveSandboxProvider(
  options: FixedEvalOptions,
): Promise<{ provider: import("../sandbox/types").SandboxProvider; environmentId: EvalEnvironmentId; providerId: SandboxProviderId; officialScore: boolean; fallbackReason?: string }> {
  if (options.sandboxProvider) {
    return {
      provider: options.sandboxProvider,
      environmentId: options.environmentId ?? "sandbox",
      providerId: options.sandboxProvider.id,
      officialScore: options.environmentId === "sandbox",
    };
  }

  const environmentId = options.environmentId ?? "sandbox";
  initDefaultProviders();
  const { provider, capabilities } = await detectBestProvider(environmentId);

  return {
    provider,
    environmentId,
    providerId: provider.id,
    officialScore: capabilities.official,
    fallbackReason: capabilities.reason,
  };
}

async function runPreflight(
  provider: import("../sandbox/types").SandboxProvider,
  environmentId: EvalEnvironmentId,
): Promise<PreflightResult | null> {
  if (!provider.runPreflight) return null;
  try {
    return await provider.runPreflight(environmentId);
  } catch {
    return null;
  }
}

async function runSingleCase(
  manifest: EvalCaseManifest,
  workspaceDir: string,
  caseDir: string,
  options: FixedEvalOptions,
): Promise<CaseResult> {
  const startedAt = new Date().toISOString();
  let workerOutput = "";
  let supervisorOutput = "";
  let verifierResult: VerifierResult | null = null;
  let supervisorAssessment: Record<string, number> | null = null;
  let error: string | undefined;

  try {
    if (options.executeWorker) {
      const workerPrompt = buildWorkerPrompt(manifest, workspaceDir);
      const prevCwd = process.cwd();
      process.chdir(workspaceDir);
      _currentCaseWorkspace = workspaceDir;
      try {
        workerOutput = await options.executeWorker(workerPrompt);
      } finally {
        _currentCaseWorkspace = null;
        process.chdir(prevCwd);
      }
      await writeCaseArtifact(caseDir, "worker-output.md", workerOutput);
    }

    if (options.executeSupervisor) {
      const supervisorPrompt = buildSupervisorPrompt(
        manifest,
        workerOutput,
      );
      supervisorOutput = await options.executeSupervisor(supervisorPrompt);
      await writeCaseArtifact(caseDir, "supervisor-output.md", supervisorOutput);

      supervisorAssessment = extractAssessment(supervisorOutput);
    }

    verifierResult = await runVerifier(manifest, workspaceDir);
    await writeCaseArtifact(
      caseDir,
      "verifier.json",
      JSON.stringify(verifierResult, null, 2),
    );
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const finishedAt = new Date().toISOString();
  const objectiveSignals = getObjectiveSignals(workspaceDir);
  const patchDiff = getPatchDiff(workspaceDir);

  const score = computeScore(verifierResult, objectiveSignals, supervisorAssessment);
  await writeCaseArtifact(
    caseDir,
    "score.json",
    JSON.stringify(score, null, 2),
  );

  if (patchDiff) {
    await writeCaseArtifact(caseDir, "patch.diff", patchDiff);
  }

  const verdict = error
    ? "error"
    : !verifierResult
      ? "skipped"
      : verifierResult.verdict === "pass"
        ? "pass"
        : "fail";

  return {
    caseId: manifest.id,
    title: manifest.title,
    category: manifest.category,
    suite: manifest.suite,
    manifest,
    verdict,
    verifierResult,
    objectiveSignals,
    supervisorAssessment,
    score,
    workerOutput,
    supervisorOutput,
    patchDiff,
    startedAt,
    finishedAt,
    error,
  };
}

function buildWorkerPrompt(
  manifest: EvalCaseManifest,
  workspaceDir: string,
): string {
  return `You are working on an evaluation task in an isolated workspace at ${workspaceDir}.

All file operations and shell commands must operate within this workspace. Do not access files outside this directory.

## Task
${manifest.taskPrompt}

## Requirements
${manifest.expectedVerification.map((v) => `- ${v}`).join("\n")}

Complete the task using the tools available to you. Make sure to verify your work.`;
}

function buildSupervisorPrompt(
  manifest: EvalCaseManifest,
  workerOutput: string,
): string {
  return `You are evaluating the work of another agent on this task:

## Task
${manifest.taskPrompt}

## Expected Verification
${manifest.expectedVerification.map((v) => `- ${v}`).join("\n")}

## Worker Output
${workerOutput}

Please provide a structured assessment with scores (0-100) for dimensions: taskCompletion, verification, toolUse, efficiency, safety.

Return your assessment as JSON object with a "dimensions" field containing scores for each dimension.`;
}

function extractAssessment(
  supervisorOutput: string,
): Record<string, number> | null {
  try {
    const jsonMatch = supervisorOutput.match(/\{[\s\S]*"dimensions"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.dimensions) {
        return parsed.dimensions as Record<string, number>;
      }
    }
  } catch {
  }
  return null;
}

export async function runFixedEval(
  options: FixedEvalOptions,
): Promise<EvalRunReport> {
  if (options.abortSignal?.aborted) {
    throw new Error("Eval aborted before start");
  }

  const { provider, environmentId: resolvedEnvId, providerId, officialScore, fallbackReason } = await resolveSandboxProvider(options);

  setVerifierSandboxProvider(provider);
  setEvalSandboxProvider(provider);

  const runId = randomUUID().slice(0, 8);
  const evalDir = join(getEvalsDir(), runId);
  await mkdir(evalDir, { recursive: true });

  const { categoryId, suiteId, environmentId: optEnv, onProgress } = options;
  const environmentId = optEnv ?? "sandbox";
  const suite = getSuite(categoryId, suiteId, environmentId);
  if (!suite) {
    throw new Error(`Suite not found: category=${categoryId} suite=${suiteId} environment=${environmentId}`);
  }
  const caseRefs = suite.cases;

  const traceLines: string[] = [];

  function recordTrace(event: string, data: Record<string, unknown>): void {
    traceLines.push(JSON.stringify({ t: Date.now(), event, ...data }));
  }

  recordTrace("eval-start", { categoryId, suiteId, environmentId, providerId, runId });

  await writeFile(
    join(evalDir, "registry.json"),
    JSON.stringify(getCategories(), null, 2),
    "utf-8",
  );

  // === PREFLIGHT ===
  const preflight = await runPreflight(provider, environmentId);
  if (preflight) {
    await writeFile(join(evalDir, "preflight.json"), JSON.stringify(preflight, null, 2), "utf-8");
    recordTrace("preflight", { allFound: preflight.allFound, checks: preflight.checks.map(c => `${c.name}:${c.found}`) });
    onProgress?.({
      type: "preflight",
      preflight,
      totalCases: caseRefs.length,
      completedCases: 0,
    });
  }

  const results: CaseResult[] = [];
  let passed = 0;
  let failed = 0;
  let errored = 0;
  let infraErrorCount = 0;
  let skipped = 0;

  const startedAt = new Date().toISOString();

  for (const caseRef of caseRefs) {
    if (options.abortSignal?.aborted) {
      recordTrace("eval-abort", { reason: "signal" });
      await writeFile(join(evalDir, "shutdown-reason.json"), JSON.stringify({
        reason: "user_cancel",
        mode: "eval",
        runId,
        caseId: null,
        timestamp: new Date().toISOString(),
      }, null, 2), "utf-8");
      throw new Error("Eval aborted");
    }

    const manifest = getManifest(caseRef.manifestId);
    if (!manifest) {
      errored++;
      recordTrace("manifest-missing", { caseId: caseRef.id, manifestId: caseRef.manifestId });
      onProgress?.({
        type: "case-start",
        caseId: caseRef.id,
        title: caseRef.title,
        totalCases: caseRefs.length,
        completedCases: results.length,
      });
      onProgress?.({
        type: "case-end",
        caseId: caseRef.id,
        title: caseRef.title,
        error: `Manifest not found: ${caseRef.manifestId}`,
        totalCases: caseRefs.length,
        completedCases: results.length + 1,
      });
      continue;
    }

    // If preflight failed, skip to infra_error
    if (preflight && !preflight.allFound) {
      infraErrorCount++;
      recordTrace("case-infra-error", { caseId: manifest.id, reason: "preflight-failed" });
      const infraResult: CaseResult = {
        caseId: manifest.id,
        title: manifest.title,
        category: manifest.category,
        suite: manifest.suite,
        manifest,
        verdict: "infra_error",
        verifierResult: null,
        objectiveSignals: null,
        supervisorAssessment: null,
        score: null,
        workerOutput: "",
        supervisorOutput: "",
        patchDiff: "",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        error: "Infrastructure error: preflight checks failed — missing tools in sandbox environment",
      };
      results.push(infraResult);
      onProgress?.({
        type: "infra-error",
        caseId: caseRef.id,
        title: manifest.title,
        result: infraResult,
        totalCases: caseRefs.length,
        completedCases: results.length,
        error: "Infrastructure error: preflight checks failed",
      });
      continue;
    }

    recordTrace("case-start", { caseId: manifest.id, title: manifest.title });

    onProgress?.({
      type: "case-start",
      caseId: caseRef.id,
      title: manifest.title,
      totalCases: caseRefs.length,
      completedCases: results.length,
    });

    try {
      const workspace = await createCaseWorkspace(runId, manifest);

      await writeFile(
        join(workspace.caseDir, "manifest.json"),
        JSON.stringify(manifest, null, 2),
        "utf-8",
      );

      const result = await runSingleCase(
        manifest,
        getCaseWorkspaceDir(workspace.caseDir),
        workspace.caseDir,
        options,
      );
      results.push(result);

      if (result.verdict === "pass") passed++;
      else if (result.verdict === "fail") failed++;
      else if (result.verdict === "error") errored++;
      else if (result.verdict === "infra_error") infraErrorCount++;
      else skipped++;

      recordTrace("case-end", {
        caseId: manifest.id,
        verdict: result.verdict,
        score: result.score?.finalScore,
      });

      onProgress?.({
        type: "case-end",
        caseId: caseRef.id,
        title: manifest.title,
        result,
        totalCases: caseRefs.length,
        completedCases: results.length,
      });
    } catch (err) {
      errored++;
      recordTrace("case-error", {
        caseId: manifest.id,
        error: err instanceof Error ? err.message : String(err),
      });
      onProgress?.({
        type: "case-end",
        caseId: caseRef.id,
        title: manifest.title,
        error: err instanceof Error ? err.message : String(err),
        totalCases: caseRefs.length,
        completedCases: results.length + 1,
      });
    }
  }

  await writeFile(join(evalDir, "trace.jsonl"), traceLines.join("\n"), "utf-8");

  const finishedAt = new Date().toISOString();
  const averageScore =
    results.length > 0
      ? results.reduce((sum, r) => sum + (r.score?.finalScore ?? 0), 0) /
        results.length
      : 0;

  const suiteSummary: SuiteSummary = {
    suiteId,
    categoryId,
    totalCases: caseRefs.length,
    passed,
    failed,
    errored,
    infraErrorCount,
    skipped,
    averageScore: Math.round(averageScore * 100) / 100,
    results,
  };

  const status = infraErrorCount > 0
    ? "infra_error"
    : options.abortSignal?.aborted
      ? "cancelled"
      : "completed";

  const meta: EvalRunMeta = {
    runId,
    startedAt,
    finishedAt,
    categoryId,
    suiteId,
    environmentId,
    testSetId: options.testSetId ?? suiteId,
    model: options.models?.[0] ?? "default",
    status,
    providerId,
    officialScore: infraErrorCount > 0 ? false : officialScore,
    fallbackReason: infraErrorCount > 0 ? "Infrastructure error: preflight checks failed" : fallbackReason,
    preflight: preflight ?? undefined,
  };

  const overallScore = averageScore;

  onProgress?.({
    type: "suite-end",
    totalCases: caseRefs.length,
    completedCases: results.length,
  });

  // Write provider environment snapshot
  await writeFile(join(evalDir, "provider-env.json"), JSON.stringify({
    providerId,
    environmentId,
    officialScore: officialScore && infraErrorCount === 0,
    hostNode: process.execPath,
    hostCwd: process.cwd(),
    hostPlatform: process.platform,
    hostArch: process.arch,
    hostEnv: {
      PATH: process.env.PATH?.slice(0, 500),
      HOME: process.env.HOME,
      SHELL: process.env.SHELL,
      USER: process.env.USER,
      NODE_ENV: process.env.NODE_ENV,
    },
    timestamp: new Date().toISOString(),
  }, null, 2), "utf-8");

  // Write shutdown metadata
  await writeFile(join(evalDir, "shutdown-reason.json"), JSON.stringify({
    reason: status,
    mode: "eval",
    runId,
    status,
    infraErrorCount,
    timestamp: new Date().toISOString(),
  }, null, 2), "utf-8");

  setVerifierSandboxProvider(null);
  setEvalSandboxProvider(null);

  return {
    meta,
    suiteSummary,
    overallScore: Math.round(overallScore * 100) / 100,
  };
}
