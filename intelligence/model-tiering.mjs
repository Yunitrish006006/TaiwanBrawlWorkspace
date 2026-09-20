import { loadModelPolicy, normalizeTask, taskSignals, tierNames } from "./model-policy.mjs";

export function selectModelTier(task, options = {}, policy = loadModelPolicy()) {
  if (typeof task !== "string" || !task.trim()) throw new Error("A nonempty task is required");
  if (task.length > policy.limits.maxTaskChars) throw new Error(`Task exceeds ${policy.limits.maxTaskChars} characters; pass a bounded task`);
  const allowed = ["tier", "reason", "failedAttempts", "failureKind", "evidence", "handoff"];
  for (const key of Object.keys(options)) if (!allowed.includes(key)) throw new Error(`Unknown model option: ${key}`);
  for (const key of ["reason", "evidence", "handoff"]) {
    if (options[key] !== undefined && (typeof options[key] !== "string" || !options[key].trim() || options[key].length > policy.limits.maxHandoffChars)) {
      throw new Error(`${key} must be nonempty text of at most ${policy.limits.maxHandoffChars} characters`);
    }
  }
  if (options.tier !== undefined && !tierNames.includes(options.tier)) throw new Error(`Unknown tier: ${options.tier}`);
  const failedAttempts = options.failedAttempts ?? 0;
  if (!Number.isSafeInteger(failedAttempts) || failedAttempts < 0) throw new Error("failedAttempts must be a nonnegative integer");
  if (options.failureKind && ![...policy.escalation.allowedFailureKinds, ...policy.escalation.blockedFailureKinds].includes(options.failureKind)) {
    throw new Error(`Unknown failure kind: ${options.failureKind}`);
  }
  if ((options.failureKind || options.evidence) && failedAttempts === 0) throw new Error("Failure details require failedAttempts > 0");
  if (failedAttempts > 0 && (!options.failureKind || !options.evidence)) throw new Error("Failed attempts require failureKind and concrete evidence");

  const toolTask = Object.entries(policy.toolTasks).find(([, aliases]) => aliases.some((alias) => normalizeTask(alias) === normalizeTask(task)))?.[0] ?? null;
  const signals = taskSignals(task, policy);
  const reasons = [];
  let tier = policy.defaultTier;
  if (toolTask) { tier = "tools"; reasons.push("Exact supported tool task; no model call needed"); }
  else if (signals.complex || (signals.changesBehavior && (signals.sensitive || signals.crossRepository))) {
    tier = "deep"; reasons.push("Complex reasoning or a sensitive/cross-repository behavior change");
  } else if (signals.docsOnly || signals.readOnly || signals.mechanicalOnly) {
    tier = "economy"; reasons.push("Bounded documentation, inspection or mechanical work");
  } else {
    reasons.push("Routine implementation or unclear scope; start with the balanced model");
  }
  const recommendedTier = tier;
  if (options.tier && options.tier !== tier) {
    if (toolTask || options.tier === "tools") throw new Error("Tools tier is reserved for exact supported tool tasks");
    if (!options.reason) throw new Error("Changing the recommended tier requires a reason");
    tier = options.tier;
    reasons.push(`Explicit tier override: ${options.reason}`);
  }

  let blocked = false;
  let escalated = false;
  if (failedAttempts > 0 && policy.escalation.blockedFailureKinds.includes(options.failureKind)) {
    blocked = true;
    reasons.push(`Resolve ${options.failureKind} before another model run; a larger model will not fix it`);
  } else if (failedAttempts > 0 && tier === "tools") {
    blocked = true;
    reasons.push("Inspect the tool failure; do not start a model for an exact tool task");
  } else if (failedAttempts >= policy.escalation.minimumFailedAttempts) {
    if (options.tier) throw new Error("Use a tier override or evidence-based escalation, not both");
    tier = policy.escalation.ladder[policy.escalation.ladder.indexOf(tier) + 1] ?? tier;
    escalated = tier !== recommendedTier;
    reasons.push(`Escalated one level after ${failedAttempts} reported ${options.failureKind} failures: ${options.evidence}`);
  }

  return {
    policyVersion: policy.schemaVersion,
    recommendedTier,
    tier,
    ...policy.tiers[tier],
    toolTask,
    blocked,
    escalated,
    reasons,
    limits: { ...policy.limits },
    escalation: { ...policy.escalation, automatic: false },
    context: {
      repositories: "Read owning repositories and directly affected contracts only",
      handoff: "Carry changed files, relevant errors and validation results; do not replay the full conversation",
      validation: "Reuse passed checks until code or relevant inputs change; do not shrink required checks to fit a tier",
    },
    execution: "Planning is local and makes no model calls. The run-task entrypoint applies model and reasoning settings to a new Codex process.",
  };
}
