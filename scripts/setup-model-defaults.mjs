#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadModelPolicy } from "../intelligence/model-policy.mjs";

// Project defaults are derived from the canonical economy tier; no model call.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const marker = "# Taiwan Brawl economy defaults; generated from data/model-policy.json";
try {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg.startsWith("--") && arg !== "--write")) {
    throw new Error("Usage: node scripts/setup-model-defaults.mjs [--write] [directory ...]");
  }
  const write = args.includes("--write");
  const directories = args.filter((arg) => arg !== "--write");
  const { model, reasoningEffort } = loadModelPolicy().tiers.economy;
  const content = `${marker}\nmodel = "${model}"\nmodel_reasoning_effort = "${reasoningEffort}"\n`;
  const managed = new RegExp(`^${marker}\nmodel = "[a-z0-9._-]+"\nmodel_reasoning_effort = "(?:low|medium|high)"\n$`);
  // Preflight every destination before writing anything. Never replace custom settings.
  const targets = [...new Set((directories.length ? directories : [root]).map((dir) => fs.realpathSync(dir)))].map((dir) => {
    if (!fs.statSync(dir).isDirectory()) throw new Error(`Not a directory: ${dir}`);
    const configDir = path.join(dir, ".codex");
    const file = path.join(configDir, "config.toml");
    for (const candidate of [configDir, file]) {
      if (fs.lstatSync(candidate, { throwIfNoEntry: false })?.isSymbolicLink()) {
        throw new Error(`Refusing to replace or follow a configuration symlink: ${candidate}`);
      }
    }
    const before = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    if (before !== null && !managed.test(before)) {
      throw new Error(`Existing custom config preserved: ${file}. Merge model defaults manually.`);
    }
    return { file, before };
  });
  if (write) {
    for (const { file, before } of targets) {
      if (before === content) continue;
      if (before !== null && fs.readFileSync(file, "utf8") !== before) throw new Error(`Config changed during setup: ${file}`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content, { flag: before === null ? "wx" : "w" });
    }
  }
  console.log(JSON.stringify({ dryRun: !write, model, reasoningEffort, files: targets.map(({ file }) => file), content }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
