#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateModelPolicy } from "../intelligence/model-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
let passed = 0;
const check = (condition, message) => condition ? passed++ : failures.push(message);
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(root, "data", name), "utf8"));

const repos = readJson("repositories.json");
const relationships = readJson("relationships.json");
const contracts = readJson("contracts.json");
const testMatrix = readJson("test-matrix.json");
const modelPolicyErrors = validateModelPolicy(readJson("model-policy.json"));
check(modelPolicyErrors.length === 0, `model policy: ${modelPolicyErrors.join("; ")}`);

check(repos.schemaVersion === 1, "repositories schemaVersion must be 1");
check(Array.isArray(repos.repositories) && repos.repositories.length >= 4, "expected at least four repositories");
const ids = repos.repositories.map((repo) => repo.id);
check(new Set(ids).size === ids.length, "repository ids must be unique");
check(ids.includes("taiwan-brawl-front") && ids.includes("taiwan-brawl-back"), "primary front/back repositories are required");

const known = new Set(ids);
for (const rel of relationships.relationships) {
  check(known.has(rel.from), `relationship ${rel.id} has unknown from: ${rel.from}`);
  check(known.has(rel.to) || String(rel.to).startsWith("external:"), `relationship ${rel.id} has unknown to: ${rel.to}`);
}
for (const contract of contracts.contracts) {
  check(contract.id && contract.owners?.length > 0, "every contract needs id and owner");
  for (const id of [...(contract.owners ?? []), ...(contract.consumers ?? [])]) check(known.has(id), `contract ${contract.id} references unknown repo ${id}`);
  check(Array.isArray(contract.invariants) && contract.invariants.length > 0, `contract ${contract.id} needs invariants`);
}
check(Array.isArray(testMatrix.categories) && testMatrix.categories.length >= 4, "test matrix is too small");

const required = [
  "README.md",
  "AGENTS.md",
  "data/repositories.json",
  "data/relationships.json",
  "data/contracts.json",
  "data/test-matrix.json",
  "data/model-policy.json",
  "apps/viewer_flutter/pubspec.yaml"
];
for (const file of required) check(fs.existsSync(path.join(root, file)), `missing ${file}`);

const gitignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
check(gitignore.includes("apps/viewer_flutter/assets/workspace-data.json"), "generated Flutter workspace data must be ignored");
check(gitignore.includes("apps/viewer_flutter/web/data/workspace-data.json"), "runtime Flutter web workspace data must be ignored");

const forbiddenDirs = new Set(["node_modules", "build", "dist", "out", ".dart_tool"]);
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
  /\bsk-[A-Za-z0-9]{20,}\b/,
  /https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9._-]+/
];
function walk(dir, rel = "") {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    const nextRel = path.join(rel, entry.name);
    if (nextRel.split(path.sep).some((part) => forbiddenDirs.has(part))) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, nextRel);
    else if (/\.(md|json|mjs|js|yml|yaml|html|txt|gitignore)$/.test(entry.name) || entry.name === ".gitignore") {
      const text = fs.readFileSync(full, "utf8");
      check(!/\/(?:home|Users)\/[A-Za-z0-9._-]+\//.test(text), `${nextRel} contains host-specific absolute path`);
      for (const pattern of secretPatterns) check(!pattern.test(text), `${nextRel} may contain a secret`);
    }
  }
}
walk(root);

if (failures.length) {
  console.error(`TaiwanBrawlWorkspace validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`TaiwanBrawlWorkspace validation passed (${passed} checks).`);
