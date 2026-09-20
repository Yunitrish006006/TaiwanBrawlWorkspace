import fs from "node:fs";

export const tierNames = ["tools", "economy", "standard", "deep", "expert"];
const signalNames = ["documentation", "inspection", "mutation", "implementation", "complex", "sensitive", "crossRepository", "contract", "mechanical"];

export function validateModelPolicy(policy) {
  const errors = [];
  const check = (ok, message) => { if (!ok) errors.push(message); };
  check(policy?.schemaVersion === 1, "model policy schemaVersion must be 1");
  check(["economy", "standard"].includes(policy?.defaultTier), "default tier must be economy or standard");
  for (const name of tierNames) {
    const tier = policy?.tiers?.[name];
    check(tier && Number.isInteger(tier.timeoutSeconds) && tier.timeoutSeconds > 0 && tier.timeoutSeconds <= 3600, `${name} needs a timeout of 1..3600 seconds`);
    check(name === "tools" ? tier?.model === null && tier?.reasoningEffort === null
      : /^[a-z0-9][a-z0-9._-]+$/.test(tier?.model ?? "") && ["low", "medium", "high"].includes(tier?.reasoningEffort), `${name} has invalid model or effort`);
  }
  check(Object.keys(policy?.tiers ?? {}).every((name) => tierNames.includes(name)), "unknown model tier");
  for (const [key, maximum] of [["maxTaskChars", 12000], ["maxHandoffChars", 6000]]) {
    check(Number.isInteger(policy?.limits?.[key]) && policy.limits[key] > 0 && policy.limits[key] <= maximum, `${key} must be positive and <= ${maximum}`);
  }
  for (const [key, value] of Object.entries({ maxModelRuns: 1, maxConcurrentRuns: 1, automaticRetries: 0, delegation: false })) {
    check(policy?.limits?.[key] === value, `${key} must be ${value}`);
  }
  check(Number.isInteger(policy?.escalation?.minimumFailedAttempts) && policy.escalation.minimumFailedAttempts >= 2, "escalation requires at least two failed attempts");
  check(JSON.stringify(policy?.escalation?.ladder) === JSON.stringify(tierNames.slice(1)), "invalid escalation ladder");
  check(JSON.stringify(policy?.escalation?.allowedFailureKinds) === JSON.stringify(["reasoning", "validation"]), "only reasoning/validation failures can escalate");
  check(JSON.stringify(policy?.escalation?.blockedFailureKinds) === JSON.stringify(["network", "authentication", "quota", "model-unavailable", "environment"]), "infrastructure failures must not escalate");
  const aliases = new Set();
  check(Object.keys(policy?.toolTasks ?? {}).sort().join(",") === "render,summary,validate", "tool tasks must be render, summary and validate");
  for (const entries of Object.values(policy?.toolTasks ?? {})) {
    check(Array.isArray(entries) && entries.length > 0, "tool aliases must be a nonempty array");
    if (!Array.isArray(entries)) continue;
    for (const alias of entries) {
      const normalized = typeof alias === "string" ? normalizeTask(alias) : "";
      check(normalized.length > 0 && !aliases.has(normalized), "tool aliases must be nonempty and unique");
      aliases.add(normalized);
    }
  }
  for (const name of signalNames) {
    const terms = policy?.signals?.[name];
    check(Array.isArray(terms) && terms.length > 0 && terms.every((term) => typeof term === "string" && term.trim()), `${name} needs nonempty signal terms`);
  }
  return errors;
}

export function loadModelPolicy() {
  const policy = JSON.parse(fs.readFileSync(new URL("../data/model-policy.json", import.meta.url), "utf8"));
  const errors = validateModelPolicy(policy);
  if (errors.length) throw new Error(`Invalid model policy: ${errors.join("; ")}`);
  return policy;
}

export const normalizeTask = (text) => String(text ?? "").trim().toLowerCase().replace(/\s+/g, " ");

// ASCII words need boundaries: README must not match DM, and build must not match UI.
export function hasTerm(text, term) {
  const q = normalizeTask(text);
  const word = normalizeTask(term);
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const left = /^[a-z0-9_]/.test(word) ? "(?<![a-z0-9_])" : "";
  const right = /[a-z0-9_]$/.test(word) ? "(?![a-z0-9_])" : "";
  return new RegExp(`${left}${escaped}${right}`, "u").test(q);
}

export function taskSignals(task, policy = loadModelPolicy()) {
  const signals = Object.fromEntries(Object.entries(policy.signals).map(([key, terms]) => [key, terms.some((term) => hasTerm(task, term))]));
  const clauses = String(task).split(/\b(?:and|then|also)\b|並且|並|以及|然後|同時|與|和|[;；，,。\n]/iu);
  const hasOtherWork = clauses.some((clause) =>
    !policy.signals.documentation.some((term) => hasTerm(clause, term)) &&
    policy.signals.mutation.some((term) => hasTerm(clause, term)));
  signals.docsOnly = signals.documentation && !signals.implementation && !signals.complex && !hasOtherWork;
  signals.readOnly = signals.inspection && !signals.mutation && !signals.complex;
  signals.changesBehavior = !signals.docsOnly && !signals.readOnly;
  signals.mechanicalOnly = signals.mechanical && !signals.implementation && !hasOtherWork;
  return signals;
}
