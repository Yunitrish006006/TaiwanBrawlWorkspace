#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, "data", name), "utf8"));

const output = {
  generatedFrom: [
    "data/repositories.json",
    "data/relationships.json",
    "data/contracts.json"
  ],
  repositories: read("repositories.json"),
  relationships: read("relationships.json"),
  contracts: read("contracts.json"),
};

const target = path.join(root, "apps", "viewer_flutter", "assets", "workspace-data.json");
fs.mkdirSync(path.dirname(target), { recursive: true });
const serialized = JSON.stringify(output, null, 2) + "\n";
fs.writeFileSync(target, serialized);
const webTarget = path.join(root, "apps", "viewer_flutter", "web", "data", "workspace-data.json");
fs.mkdirSync(path.dirname(webTarget), { recursive: true });
fs.writeFileSync(webTarget, serialized);
console.log(`generated viewer data: ${path.relative(root, target)} and ${path.relative(root, webTarget)}`);
