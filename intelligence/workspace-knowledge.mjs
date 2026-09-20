import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

export function resolveTask(text) {
  const q = String(text || "").toLowerCase();
  const focus = Object.entries(vocabulary)
    .filter(([, words]) => words.some((word) => q.includes(word)))
    .map(([name]) => name);
  const workspace = loadWorkspace();
  const contractMatches = workspace.contracts.contracts.filter((contract) => {
    const blob = JSON.stringify(contract).toLowerCase();
    return focus.some((term) => blob.includes(term)) || q.split(/\s+/).filter(Boolean).some((term) => term.length > 2 && blob.includes(term));
  });
  const repoIds = new Set(contractMatches.flatMap((c) => [...c.owners, ...c.consumers]));
  if (focus.includes("ui")) repoIds.add("user-ui-settings");
  if (focus.includes("deploy")) repoIds.add("taiwan-brawl-back");
  return { query: text, focus, repositories: [...repoIds], contracts: contractMatches.map((c) => c.id) };
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
  const tags = new Set(["contract-change"]);
  if (resolved.repositories.includes("taiwan-brawl-front")) tags.add("frontend-change");
  if (resolved.repositories.includes("taiwan-brawl-back")) tags.add("backend-change");
  if (resolved.repositories.some((id) => id.startsWith("user-"))) tags.add("shared-flutter-package-change");
  if (resolved.focus.includes("deploy")) tags.add("deployment-change");
  const categories = workspace.testMatrix.categories.filter((entry) => entry.requiredFor.some((tag) => tags.has(tag)));
  return { resolved, tags: [...tags], categories };
}
