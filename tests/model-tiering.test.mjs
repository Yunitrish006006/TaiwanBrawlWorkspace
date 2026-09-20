import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadModelPolicy, validateModelPolicy, hasTerm } from "../intelligence/model-policy.mjs";
import { selectModelTier } from "../intelligence/model-tiering.mjs";
import { resolveTask, testPlanForTask } from "../intelligence/workspace-knowledge.mjs";
import { buildOrchestrationPlan } from "../intelligence/orchestration-plan.mjs";
import { parseTaskOptions } from "../intelligence/task-options.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

test("exact deterministic tasks use tools and never a model", () => {
  for (const task of ["summary", "  Workspace SUMMARY  ", "驗證工作區", "產生 viewer 資料"]) {
    const plan = selectModelTier(task);
    assert.equal(plan.tier, "tools");
    assert.equal(plan.model, null);
    assert.equal(plan.reasoningEffort, null);
  }
  for (const task of ["summary; delete something", "summary and fix code", "驗證工作區並更新程式"]) {
    assert.notEqual(selectModelTier(task).tier, "tools");
  }
});

test("clear tasks select economical tiers in English and Chinese", () => {
  for (const task of ["更新 README 文件", "fix documentation typo", "查看聊天推播流程", "更新 auth 文件", "更新推播文案", "format Dart files"]) {
    assert.equal(selectModelTier(task).tier, "economy", task);
  }
  for (const task of ["修正按鈕顏色", "fix inventory sorting bug", "幫我補上 model tiering", "處理這個問題"]) {
    assert.equal(selectModelTier(task).tier, "standard", task);
  }
});

test("sensitive behavior and complex analysis have priority over cheap signals", () => {
  for (const task of ["修改 Royale 房間 websocket", "fix auth bug", "format code and fix session validation", "更新 README 並修復登入 bug", "更新 README 並修改登入", "update docs and change session expiry", "分析競態根因", "更新前後端 API", "review architecture", "write security audit documentation"]) {
    assert.equal(selectModelTier(task).tier, "deep", task);
  }
});

test("related consumers do not automatically promote simple work", () => {
  const plan = buildOrchestrationPlan("更新聊天推播文案");
  assert.ok(plan.affectedRepositories.length > 1);
  assert.equal(plan.modelSelection.tier, "economy");
  assert.deepEqual([...new Set(plan.validation.map((item) => item.repository))], ["workspace"]);
});

test("ASCII terms respect boundaries without breaking mixed Chinese text", () => {
  assert.equal(hasTerm("README", "dm"), false);
  assert.equal(hasTerm("build", "ui"), false);
  assert.equal(hasTerm("request", "quest"), false);
  assert.equal(hasTerm("修改websocket協定", "websocket"), true);
  assert.equal(hasTerm("API/schema", "schema"), true);
  assert.equal(hasTerm("something (a+b)", "a+b"), true);
  assert.deepEqual(resolveTask("更新 README 文件").focus, []);
  assert.deepEqual(resolveTask("build worker").focus, []);
});

test("documents and inspections avoid unrelated product test suites", () => {
  for (const task of ["更新 README 文件", "更新 auth 文件", "查看 Royale websocket 流程"]) {
    const plan = testPlanForTask(task);
    assert.deepEqual(plan.categories.map((entry) => entry.id), ["workspace"]);
    assert.ok(!plan.tags.includes("contract-change"));
  }
});

test("behavior changes retain owner and consumer validation", () => {
  const plan = testPlanForTask("修改 Royale 房間 websocket");
  assert.ok(plan.tags.includes("contract-change"));
  assert.deepEqual(plan.categories.map((entry) => entry.id), ["workspace", "frontend", "backend"]);
  const shared = testPlanForTask("修改 UI 主題");
  assert.ok(shared.categories.some((entry) => entry.id === "shared-ui-settings"));
  assert.ok(!shared.categories.some((entry) => entry.id === "shared-user-basic"));
  assert.equal(testPlanForTask("修正未知功能").scopeNeedsInspection, true);
  assert.ok(testPlanForTask("更新 README 並修改登入").categories.some((entry) => entry.id === "backend"));
});

test("explicit model tier changes require a reason and cannot invent tool tasks", () => {
  assert.throws(() => selectModelTier("fix sorting", { tier: "expert" }), /reason/);
  assert.equal(selectModelTier("fix sorting", { tier: "expert", reason: "verified multi-system invariant failure" }).model, "gpt-6-astra");
  assert.throws(() => selectModelTier("fix sorting", { tier: "tools", reason: "save quota" }), /reserved/);
  assert.throws(() => selectModelTier("summary", { tier: "expert", reason: "no need" }), /reserved/);
  assert.throws(() => selectModelTier("fix sorting", { tier: "invalid" }), /Unknown tier/);
});

test("escalation needs two reported failures and concrete evidence", () => {
  const failure = { failedAttempts: 2, failureKind: "validation", evidence: "The same regression assertion failed after two distinct fixes" };
  assert.equal(selectModelTier("fix sorting", { ...failure, failedAttempts: 1 }).tier, "standard");
  assert.equal(selectModelTier("fix sorting", failure).tier, "deep");
  assert.equal(selectModelTier("修改 auth 邏輯", failure).tier, "expert");
  assert.equal(selectModelTier("更新 README", failure).tier, "standard");
  assert.throws(() => selectModelTier("fix sorting", { failedAttempts: 2 }), /require/);
  assert.throws(() => selectModelTier("fix sorting", { ...failure, evidence: " " }), /nonempty/);
  assert.throws(() => selectModelTier("fix sorting", { ...failure, tier: "expert", reason: "test" }), /not both/);
});

test("infrastructure failures block another run instead of burning a larger model", () => {
  for (const failureKind of ["network", "authentication", "quota", "model-unavailable", "environment"]) {
    const plan = selectModelTier("fix sorting", { failedAttempts: 2, failureKind, evidence: "observed infrastructure failure" });
    assert.equal(plan.blocked, true);
    assert.equal(plan.escalated, false);
    assert.equal(plan.tier, "standard");
  }
});

test("invalid input is rejected before model execution", () => {
  for (const task of ["", "   ", null, "x".repeat(6001)]) assert.throws(() => selectModelTier(task));
  for (const options of [{ failedAttempts: -1 }, { failedAttempts: 1.5 }, { failureKind: "network" }, { model: "unknown" }, { handoff: "x".repeat(3001) }]) {
    assert.throws(() => selectModelTier("fix sorting", options));
  }
});

test("canonical policy validation catches unsupported budgets, tiers and efforts", () => {
  assert.deepEqual(validateModelPolicy(loadModelPolicy()), []);
  for (const mutate of [
    (policy) => { policy.tiers.economy.reasoningEffort = "ultra"; },
    (policy) => { policy.limits.maxConcurrentRuns = 2; },
    (policy) => { policy.defaultTier = "expert"; },
    (policy) => { policy.toolTasks.shell = ["run anything"]; },
    (policy) => { policy.escalation.allowedFailureKinds.push("quota"); },
    (policy) => { policy.tiers.standard.timeoutSeconds = 0; },
    (policy) => { policy.signals.complex = []; },
  ]) {
    const policy = loadModelPolicy(); mutate(policy);
    assert.ok(validateModelPolicy(policy).length > 0);
  }
});

test("CLI option parsing rejects typos and ambiguous duplicates", () => {
  assert.throws(() => parseTaskOptions(["fix", "--tiers", "expert"]), /Unknown/);
  assert.throws(() => parseTaskOptions(["fix", "--tier"]), /Missing/);
  assert.throws(() => parseTaskOptions(["fix", "--failed-attempts", "NaN"]), /integer/);
  assert.throws(() => parseTaskOptions(["fix", "--tier", "deep", "--tier", "expert"]), /Duplicate/);
  assert.equal(parseTaskOptions(["--", "--literal task"]).task, "--literal task");
});

test("CLI and JSON-lines adapter expose the same plan and preserve error IDs", () => {
  const task = "修改 Royale 房間 websocket";
  const cli = spawnSync(process.execPath, ["scripts/taiwan-brawl-intelligence.mjs", "orchestrate", task], { cwd: root, encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  const requests = [
    { id: 1, method: "orchestrate", params: { task } },
    { id: 2, method: "modelPlan", params: { task: "更新 README 文件" } },
    { id: 3, method: "modelPlan", params: { task, options: { tier: "bad" } } },
    { id: 4, method: "resolve", params: { task: "聊天" } },
  ];
  const adapter = spawnSync(process.execPath, ["mcp/server.mjs"], { cwd: root, encoding: "utf8", input: requests.map((req) => JSON.stringify(req)).join("\n") + "\n" });
  assert.equal(adapter.status, 0, adapter.stderr);
  const responses = adapter.stdout.trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(responses[0].result, JSON.parse(cli.stdout));
  assert.equal(responses[1].result.tier, "economy");
  assert.equal(responses[2].id, 3);
  assert.match(responses[2].error, /Unknown tier/);
  assert.ok(responses[3].result.repositories.includes("taiwan-brawl-back"));
});
