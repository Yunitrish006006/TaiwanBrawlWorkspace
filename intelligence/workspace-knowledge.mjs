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
  gameModule: ["game module", "game package", "gameplay resource", "game catalog", "archery", "mini royale", "street scrap", "street-scrap", "street_scrap", "街角拾荒", "遊戲模組", "遊戲套件", "玩法資源", "遊戲目錄"],
};

// These game modules are separately owned packages inside the frontend repo.
// Keep task routing explicit so a catalog/backend consumer is not selected as
// the implementation owner for a package-only change.
const gamePackageOwnership = [
  {
    repository: "taiwan-brawl-front",
    contracts: ["optional-game-modules"],
    aliases: ["archery", "射箭"],
  },
  {
    repository: "taiwan-brawl-front",
    contracts: ["optional-game-modules"],
    aliases: ["mini royale", "mini-royale"],
  },
  {
    repository: "taiwan-brawl-front",
    contracts: ["optional-game-modules"],
    aliases: ["street scrap", "street-scrap", "street_scrap", "街角拾荒"],
  },
];
const backendOwnershipTerms = [
  "backend", "worker", "api", "endpoint", "cloudflare", "wrangler", "d1", "kv",
  "後端", "伺服器", "API", "資料庫", "資源端點", "目錄端點",
];

const genericTaskTerms = new Set([
  "change",
  "modify",
  "package",
  "shared",
  "update",
  "api",
  "backend",
  "worker",
  "endpoint",
  "cloudflare",
  "wrangler",
  "d1",
  "kv",
  "修改",
  "更新",
  "套件",
  "共用",
]);

export function resolveTask(text) {
  const q = String(text || "").toLowerCase();
  const matchingGamePackages = gamePackageOwnership.filter(({ aliases }) =>
    aliases.some((alias) => hasTerm(q, alias)));
  const explicitlyBackendOwned = backendOwnershipTerms.some((term) => hasTerm(q, term));
  const focus = Object.entries(vocabulary)
    .filter(([, words]) => words.some((word) => hasTerm(q, word)))
    .map(([name]) => name);
  const workspace = loadWorkspace();
  const uiOnlyTask = focus.length === 1 && focus[0] === "ui";
  const contractMatches = workspace.contracts.contracts.filter((contract) => {
    const blob = JSON.stringify(contract).toLowerCase();
    // UI terms such as "theme" and "locale" appear in unrelated package
    // invariants. For a UI-only task, route by the contract's identity and
    // public surface instead of incidental mentions in its full description.
    const uiIdentity = [contract.id, ...contract.owners, ...contract.consumers, ...contract.surface]
      .join(" ")
      .toLowerCase();
    const focusMatch = uiOnlyTask
      ? hasTerm(uiIdentity, "ui") || hasTerm(uiIdentity, "theme") || hasTerm(uiIdentity, "locale")
      : focus.some((term) => hasTerm(blob, term));
    const queryTermsMatch = !uiOnlyTask && q
      .split(/\s+/)
      .filter(Boolean)
      .some((term) => term.length > 2 && !genericTaskTerms.has(term) && hasTerm(blob, term));
    return focusMatch || queryTermsMatch;
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
  const gamePackageContracts = matchingGamePackages.flatMap((gamePackage) =>
    gamePackage.contracts.map((id) => workspace.contracts.contracts.find((contract) => contract.id === id))
      .filter(Boolean));
  const relatedContracts = [...new Map(
    [...selectedContracts, ...gamePackageContracts].map((contract) => [contract.id, contract]),
  ).values()];
  const repoIds = new Set(relatedContracts.flatMap((c) => [...c.owners, ...c.consumers]));
  for (const gamePackage of matchingGamePackages) repoIds.add(gamePackage.repository);
  if (focus.includes("ui")) repoIds.add("user-ui-settings");
  if (focus.includes("deploy")) repoIds.add("taiwan-brawl-back");
  return {
    query: text,
    focus,
    repositories: [...repoIds],
    contracts: relatedContracts.map((c) => c.id),
    primaryRepository: matchingGamePackages.length > 0 && !explicitlyBackendOwned
      ? matchingGamePackages[0].repository
      : null,
  };
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
