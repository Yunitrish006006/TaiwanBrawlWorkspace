import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { executeTaskRun, prepareTaskRun, usageFromEvent, workspaceRoot } from "../intelligence/task-runner.mjs";

const output = () => ({ text: "", write(chunk) { this.text += chunk; } });
function fixture(t, source) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "taiwan-brawl-tiering-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "fake-codex.mjs");
  fs.writeFileSync(file, source);
  return { directory, file, stateDirectory: path.join(directory, "state") };
}
function fakeRun(run, file) { return { ...run, executable: process.execPath, args: [file, ...run.args] }; }
const completed = JSON.stringify({ type: "turn.completed", usage: { input_tokens: 100, cached_input_tokens: 40, output_tokens: 10 } });

test("runner applies the chosen model, effort and execution limits", () => {
  const run = prepareTaskRun("更新 README");
  assert.equal(run.args[run.args.indexOf("--model") + 1], "gpt-5.6-luna");
  assert.ok(run.args.includes('model_reasoning_effort="low"'));
  assert.equal(run.args[run.args.indexOf("--disable") + 1], "multi_agent");
  assert.equal(run.args[run.args.indexOf("--sandbox") + 1], "workspace-write");
  assert.ok(!run.args.some((arg) => arg.includes("bypass")));
  assert.equal(run.args.at(-1), "-");
});

test("dry run never starts Codex even when it is absent from PATH", () => {
  const result = spawnSync(process.execPath, ["scripts/run-task.mjs", "更新 README"], {
    cwd: workspaceRoot, encoding: "utf8", env: { ...process.env, PATH: "" },
  });
  assert.equal(result.status, 0, result.stderr);
  const preview = JSON.parse(result.stdout);
  assert.equal(preview.dryRun, true);
  assert.equal(preview.executable, "codex");
  assert.ok(preview.promptChars > 0);
  assert.ok(!Object.hasOwn(preview, "prompt"));
});

test("cross-repository write access is included only for explicitly supplied directories", (t) => {
  const { directory } = fixture(t, "");
  assert.ok(!prepareTaskRun("修改前後端 API").args.includes("--add-dir"));
  const run = prepareTaskRun("修改前後端 API", {}, { addDirs: [directory, directory] });
  assert.equal(run.args.filter((arg) => arg === "--add-dir").length, 1);
  assert.equal(run.args[run.args.indexOf("--add-dir") + 1], directory);
});

test("tool task executes locally without a model and ignores another cwd", async (t) => {
  const { directory, stateDirectory } = fixture(t, "");
  const run = prepareTaskRun("summary", {}, { cwd: directory });
  assert.equal(run.cwd, workspaceRoot);
  assert.equal(run.executable, process.execPath);
  const stdout = output();
  const result = await executeTaskRun(run, { stateDirectory, stdout, stderr: output() });
  assert.equal(result.status, "process-completed");
  assert.equal(result.model, null);
  assert.equal(JSON.parse(stdout.text).repositories.length, 6);
});

test("one process receives literal task text; usage is recorded without prompts", async (t) => {
  const { file, stateDirectory } = fixture(t, `
    let prompt = "";
    for await (const chunk of process.stdin) prompt += chunk;
    console.log(JSON.stringify({type:"test.received", args:process.argv.slice(2), prompt, nested:process.env.TAIWAN_BRAWL_TASK_ACTIVE}));
    console.log(${JSON.stringify(completed)});
  `);
  const task = "更新 README with literal $(touch SHOULD_NOT_EXIST) and `echo literal`";
  const run = prepareTaskRun(task);
  const stdout = output();
  const result = await executeTaskRun(fakeRun(run, file), { stateDirectory, stdout, stderr: output() });
  assert.equal(result.status, "process-completed");
  assert.deepEqual(result.usage, { inputTokens: 100, cachedInputTokens: 40, outputTokens: 10 });
  const received = JSON.parse(stdout.text.split("\n")[0]);
  assert.deepEqual(received.args, run.args);
  assert.ok(received.prompt.includes(task));
  assert.equal(received.nested, "1");
  const log = fs.readFileSync(path.join(stateDirectory, "usage.jsonl"), "utf8");
  assert.equal(log.trim().split("\n").length, 1);
  assert.ok(!log.includes("README"));
  assert.ok(!log.includes("prompt"));
  assert.ok(!fs.existsSync(path.join(stateDirectory, "run.lock")));
});

test("a failed model call is not retried or promoted", async (t) => {
  const { file, stateDirectory } = fixture(t, "console.log(JSON.stringify({type:'turn.failed', error:{message:'quota exceeded'}})); process.exitCode = 1;");
  const result = await executeTaskRun(fakeRun(prepareTaskRun("fix sorting"), file), { stateDirectory, stdout: output(), stderr: output() });
  assert.equal(result.status, "failed");
  assert.equal(result.model, "gpt-5.6-terra");
  assert.equal(result.usage, null);
  assert.equal(fs.readFileSync(path.join(stateDirectory, "usage.jsonl"), "utf8").trim().split("\n").length, 1);
});

test("a zero exit with no completed turn is not reported as completion", async (t) => {
  const { file, stateDirectory } = fixture(t, "console.log('incomplete provider stream');");
  const result = await executeTaskRun(fakeRun(prepareTaskRun("fix sorting"), file), { stateDirectory, stdout: output(), stderr: output() });
  assert.equal(result.status, "failed");
});

test("timeout stops an unresponsive process and releases the lock", async (t) => {
  const { file, stateDirectory } = fixture(t, "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);");
  const result = await executeTaskRun(fakeRun(prepareTaskRun("fix sorting"), file), { stateDirectory, stdout: output(), stderr: output(), timeoutMs: 250 });
  assert.equal(result.status, "timeout");
  assert.ok(result.durationMs < 5000);
  assert.ok(!fs.existsSync(path.join(stateDirectory, "run.lock")));
});

test("an active lock blocks another process before execution", async (t) => {
  const { stateDirectory } = fixture(t, "");
  fs.mkdirSync(stateDirectory);
  fs.writeFileSync(path.join(stateDirectory, "run.lock"), "occupied");
  await assert.rejects(executeTaskRun(prepareTaskRun("fix sorting"), { stateDirectory, executable: "must-not-start" }), /parallel model runs are disabled/);
  assert.equal(fs.readFileSync(path.join(stateDirectory, "run.lock"), "utf8"), "occupied");
});

test("blocked failures are rejected before creating state or starting a model", async (t) => {
  const { stateDirectory } = fixture(t, "");
  const run = prepareTaskRun("fix sorting", { failedAttempts: 2, failureKind: "network", evidence: "DNS resolution failure" });
  await assert.rejects(executeTaskRun(run, { stateDirectory, executable: "must-not-start" }), /Resolve network/);
  assert.ok(!fs.existsSync(stateDirectory));
});

test("missing executable is recorded once and releases the lock", async (t) => {
  const { directory, stateDirectory } = fixture(t, "");
  const result = await executeTaskRun(prepareTaskRun("fix sorting"), {
    stateDirectory, executable: path.join(directory, "no-codex"), stdout: output(), stderr: output(),
  });
  assert.equal(result.status, "spawn-error");
  assert.equal(result.errorCode, "ENOENT");
  assert.equal(result.usage, null);
  assert.ok(!fs.existsSync(path.join(stateDirectory, "run.lock")));
});

test("usage parsing preserves unknown usage and does not double-count cached tokens", () => {
  assert.equal(usageFromEvent({ type: "turn.completed" }), null);
  assert.equal(usageFromEvent({ type: "turn.failed" }), null);
  assert.deepEqual(usageFromEvent(JSON.parse(completed)), { inputTokens: 100, cachedInputTokens: 40, outputTokens: 10 });
});
