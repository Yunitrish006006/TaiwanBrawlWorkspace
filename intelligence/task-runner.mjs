import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { buildOrchestrationPlan } from "./orchestration-plan.mjs";

export const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const toolCommands = {
  summary: ["scripts/taiwan-brawl-intelligence.mjs", "summary"],
  validate: ["scripts/validate-workspace.mjs"],
  render: ["scripts/render-flutter-data.mjs"],
};

export function prepareTaskRun(task, options = {}, { cwd = workspaceRoot, addDirs = [] } = {}) {
  const plan = buildOrchestrationPlan(task, options);
  const selection = plan.modelSelection;
  const workingDirectory = selection.toolTask ? workspaceRoot : path.resolve(cwd);
  if (!fs.statSync(workingDirectory).isDirectory()) throw new Error("cwd must be a directory");
  const extraDirectories = selection.toolTask ? [] : [...new Set(addDirs.map((directory) => path.resolve(directory)))];
  for (const directory of extraDirectories) {
    if (!fs.statSync(directory).isDirectory()) throw new Error("add-dir must be a directory");
  }
  const prompt = selection.toolTask ? null : [
    "Complete this bounded Taiwan Brawl task in the selected working directory.",
    "Follow applicable AGENTS.md. Inspect the owning source before editing; preserve unrelated changes.",
    "Use focused file searches. Do not spawn subagents, start nested Codex sessions, or call another model.",
    "Run the relevant checks once. Repeat only after changed inputs or a failure that needs diagnosis.",
    "If scope is unclear, locate the owner before editing. Required validation must not be skipped to save quota.",
    "If blocked by network, authentication, quota or missing tools, report evidence and the remaining work.",
    "A successful process exit is not proof of passed tests. Report changed files, actual validation and limitations.",
    `Suggested repositories: ${plan.affectedRepositories.join(", ") || "unresolved; inspect the task scope"}`,
    `Affected contracts: ${plan.affectedContracts.join(", ") || "none identified"}`,
    `Validation candidates (run only in the owning repository): ${JSON.stringify(plan.validation)}`,
    options.handoff ? `Prior evidence/handoff:\n${options.handoff}` : "",
    options.evidence ? `Prior failure evidence:\n${options.evidence}` : "",
    `Task:\n${task}`,
  ].filter(Boolean).join("\n\n");
  return {
    plan,
    cwd: workingDirectory,
    executable: selection.toolTask ? process.execPath : "codex",
    args: selection.toolTask ? toolCommands[selection.toolTask] : [
      "exec", "--model", selection.model,
      "-c", `model_reasoning_effort="${selection.reasoningEffort}"`,
      "--disable", "multi_agent", "--sandbox", "workspace-write",
      "-c", 'approval_policy="never"', "--json", "--color", "never",
      ...extraDirectories.flatMap((directory) => ["--add-dir", directory]), "-",
    ],
    prompt,
  };
}

// Codex reports usage after a turn completes. Missing usage stays unknown, never zero.
export function usageFromEvent(event) {
  if (event?.type !== "turn.completed") return null;
  const usage = event.usage;
  if (![usage?.input_tokens, usage?.cached_input_tokens, usage?.output_tokens].every((value) => Number.isSafeInteger(value) && value >= 0)) return null;
  return { inputTokens: usage.input_tokens, cachedInputTokens: usage.cached_input_tokens, outputTokens: usage.output_tokens };
}

export async function executeTaskRun(run, {
  stateDirectory = path.join(workspaceRoot, ".taiwan-brawl-index"),
  executable = run.executable,
  stdout = process.stdout,
  stderr = process.stderr,
  timeoutMs = run.plan.modelSelection.timeoutSeconds * 1000,
} = {}) {
  if (run.plan.modelSelection.blocked) throw new Error(run.plan.modelSelection.reasons.at(-1));
  if (process.env.TAIWAN_BRAWL_TASK_ACTIVE === "1") throw new Error("Nested task runners are disabled");
  fs.mkdirSync(stateDirectory, { recursive: true, mode: 0o700 });
  const lockPath = path.join(stateDirectory, "run.lock");
  let lock;
  try { lock = fs.openSync(lockPath, "wx", 0o600); }
  catch (error) {
    if (error.code === "EEXIST") throw new Error("Another task holds run.lock. Check its PID before removing a stale lock; parallel model runs are disabled.");
    throw error;
  }
  const started = Date.now();
  const record = {
    id: randomUUID(), startedAt: new Date(started).toISOString(),
    taskHash: createHash("sha256").update(run.plan.task).digest("hex"),
    tier: run.plan.modelSelection.tier, model: run.plan.modelSelection.model,
    reasoningEffort: run.plan.modelSelection.reasoningEffort,
    status: "starting", usage: null,
  };
  let child;
  let timer;
  let killTimer;
  const signals = new Map();
  try {
    fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, id: record.id, startedAt: record.startedAt }) + "\n");
    const group = process.platform !== "win32";
    let stopping = false;
    const kill = (signal) => {
      if (!child?.pid) return;
      try { if (group) process.kill(-child.pid, signal); else child.kill(signal); }
      catch (error) { if (error.code !== "ESRCH") stderr.write(`Could not signal task: ${error.code}\n`); }
    };
    const stop = (status) => {
      if (stopping) return;
      stopping = true;
      record.status = status;
      kill("SIGTERM");
      killTimer = setTimeout(() => kill("SIGKILL"), 1000);
    };
    child = spawn(executable, run.args, {
      cwd: run.cwd, shell: false, detached: group,
      env: { ...process.env, TAIWAN_BRAWL_TASK_ACTIVE: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    record.status = "running";
    for (const signal of ["SIGINT", "SIGTERM"]) {
      const handler = () => stop("cancelled");
      signals.set(signal, handler);
      process.on(signal, handler);
    }
    timer = setTimeout(() => stop("timeout"), timeoutMs);
    let pending = "";
    let discarding = false;
    let turnFailed = false;
    let turnCompleted = false;
    const consume = (line) => {
      try {
        const event = JSON.parse(line);
        if (event.type === "turn.failed" || event.type === "error") turnFailed = true;
        if (event.type === "turn.completed") turnCompleted = true;
        const usage = usageFromEvent(event);
        if (usage) {
          record.usage ??= { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
          for (const key of Object.keys(usage)) record.usage[key] += usage[key];
        }
      } catch { /* Non-JSON tool output is forwarded without being retained. */ }
    };
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout.write(chunk);
      if (run.plan.modelSelection.toolTask) return;
      for (const part of chunk.split(/(?<=\n)/)) {
        if (!discarding) pending += part;
        if (pending.length > 1024 * 1024) { discarding = true; pending = ""; }
        if (part.endsWith("\n")) {
          if (!discarding) consume(pending);
          pending = "";
          discarding = false;
        }
      }
    });
    child.stderr.on("data", (chunk) => stderr.write(chunk));
    // A missing executable or an early provider failure can close stdin before the prompt is read.
    child.stdin.on("error", () => {});
    child.stdin.end(run.prompt ?? "");
    const outcome = await new Promise((resolve) => {
      let spawnError;
      child.once("error", (error) => { spawnError = error.code ?? "spawn-error"; });
      child.once("close", (code, signal) => resolve({ code, signal, spawnError }));
    });
    if (pending && !discarding) consume(pending);
    if (stopping) kill("SIGKILL"); // Terminate remaining descendants as well.
    record.exitCode = outcome.code;
    record.signal = outcome.signal;
    if (outcome.spawnError) { record.status = "spawn-error"; record.errorCode = outcome.spawnError; }
    else if (!stopping) {
      record.status = outcome.code === 0 && !turnFailed && (run.plan.modelSelection.toolTask || turnCompleted)
        ? "process-completed" : "failed";
    }
    return record;
  } finally {
    clearTimeout(timer);
    clearTimeout(killTimer);
    for (const [signal, handler] of signals) process.off(signal, handler);
    record.durationMs = Date.now() - started;
    try { fs.appendFileSync(path.join(stateDirectory, "usage.jsonl"), JSON.stringify(record) + "\n", { mode: 0o600 }); }
    finally { fs.closeSync(lock); fs.unlinkSync(lockPath); }
  }
}
