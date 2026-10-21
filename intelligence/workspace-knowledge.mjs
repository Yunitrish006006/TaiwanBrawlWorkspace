import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasTerm, taskSignals } from "./model-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(root, "data", name), "utf8"));

export function loadWorkspace() {
  return {
    repositories: readJson("repositories.json"),
    relationships: readJson("relationships.json"),
    contracts: readJson("contracts.json"),
    testMatrix: readJson("test-matrix.json"),
  };
}

const vocabulary = {
  chat: ["chat", "dm", "聊天", "私訊", "訊息", "pending", "ack"],
  push: ["push", "fcm", "firebase", "通知", "推播"],
  royale: ["royale", "room", "arena", "房間", "對戰", "牌組", "websocket"],
  auth: ["auth", "login", "session", "google", "登入", "驗證"],
  deploy: ["deploy", "wrangler", "cloudflare", "部署", "kv", "d1"],
  ui: ["theme", "locale", "ui", "字體", "主題", "語系"],
};

const genericTaskTerms = new Set([
  "change",
  "modify",
  "package",
  "shared",
  "update",
  "修改",
  "更新",
  "套件",
  "共用",
]);

export function resolveTask(text) {
  const q = String(text || "").toLowerCase();
  const focus = Object.entries(vocabulary)
    .filter(([, words]) => words.some((word) => hasTerm(q, word)))
    .map(([name]) => name);
  const workspace = loadWorkspace();
  const contractMatches = workspace.contracts.contracts.filter((contract) => {
    const blob = JSON.stringify(contract).toLowerCase();
    return focus.some((term) => hasTerm(blob, term)) || q
      .split(/\s+/)
      .filter(Boolean)
      .some((term) => term.length > 2 && !genericTaskTerms.has(term) && hasTerm(blob, term));
  });
  const packageMatches = workspace.repositories.repositories
    .filter((repo) => repo.kind.endsWith("package"))
    .filter((repo) => {
      const terms = [repo.id, repo.name].flatMap((value) => value.split(/[-_]/));
      return terms.some((term) => term.length > 2 && hasTerm(q, term));
    });
  const selectedContracts = packageMatches.length > 0
    ? contractMatches.filter((contract) => packageMatches.some((repo) =>
      contract.owners.includes(repo.id) || contract.consumers.includes(repo.id)))
    : contractMatches;
  const repoIds = new Set(selectedContracts.flatMap((c) => [...c.owners, ...c.consumers]));
  if (focus.includes("ui")) repoIds.add("user-ui-settings");
  if (focus.includes("deploy")) repoIds.add("taiwan-brawl-back");
  return { query: text, focus, repositories: [...repoIds], contracts: selectedContracts.map((c) => c.id) };
}

export function impactForRepository(repoId) {
  const workspace = loadWorkspace();
  const relationships = workspace.relationships.relationships.filter((r) => r.from === repoId || r.to === repoId);
  const contracts = workspace.contracts.contracts.filter((c) => c.owners.includes(repoId) || c.consumers.includes(repoId));
  return { repository: repoId, relationships, contracts: contracts.map((c) => c.id) };
}

export function testPlanForTask(text) {
  const resolved = resolveTask(text);
  const workspace = loadWorkspace();
  const signals = taskSignals(text);
  const tags = new Set(["data-change"]);
  if (signals.changesBehavior) {
    if (signals.contract) tags.add("contract-change");
    if (signals.gameModule) tags.add("game-module-change");
    if (resolved.repositories.includes("taiwan-brawl-front")) tags.add("frontend-change");
    if (resolved.repositories.includes("taiwan-brawl-back")) tags.add("backend-change");
    const sharedPackageIds = workspace.repositories.repositories
      .filter((repo) => repo.kind.endsWith("package"))
      .map((repo) => repo.id);
    if (resolved.repositories.some((id) => sharedPackageIds.includes(id))) {
      tags.add("shared-flutter-package-change");
    }
    if (resolved.focus.includes("deploy")) tags.add("deployment-change");
  }
  const categories = workspace.testMatrix.categories.filter((entry) =>
    entry.requiredFor.some((tag) => tags.has(tag)) &&
    (!entry.repository || resolved.repositories.includes(entry.repository)));
  return { resolved, tags: [...tags], categories, scopeNeedsInspection: signals.changesBehavior && resolved.repositories.length === 0 };
}
