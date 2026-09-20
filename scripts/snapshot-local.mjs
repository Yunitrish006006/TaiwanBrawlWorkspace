#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(fs.readFileSync(path.join(root, "data/repositories.json"), "utf8"));
const parent = path.dirname(root);
for (const repo of data.repositories) {
  const local = path.join(parent, repo.name);
  if (!fs.existsSync(path.join(local, ".git"))) {
    console.log(`${repo.id}: missing local sibling ${local}`);
    continue;
  }
  const sha = execFileSync("git", ["-C", local, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const branch = execFileSync("git", ["-C", local, "branch", "--show-current"], { encoding: "utf8" }).trim();
  console.log(`${repo.id}: ${branch} ${sha}`);
}
