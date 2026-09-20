import { resolveTask, testPlanForTask } from "./workspace-knowledge.mjs";
import { selectModelTier } from "./model-tiering.mjs";

export function buildOrchestrationPlan(task, options = {}) {
  const resolved = resolveTask(task);
  const tests = testPlanForTask(task);
  const primary = resolved.repositories.includes("taiwan-brawl-back") ? "taiwan-brawl-back"
    : resolved.repositories.includes("taiwan-brawl-front") ? "taiwan-brawl-front"
    : resolved.repositories[0] ?? null;
  return {
    task,
    primaryRepository: primary,
    affectedRepositories: resolved.repositories,
    affectedContracts: resolved.contracts,
    modelSelection: selectModelTier(task, options),
    scopeNeedsInspection: tests.scopeNeedsInspection,
    constraints: [
      "implementation detail comes from the owning repository",
      "cross-repo contract changes require consumer review",
      "do not claim validation without executed evidence",
    ],
    validation: tests.categories.flatMap((entry) => entry.commands.map((command) => ({ category: entry.id, repository: entry.repository ?? "workspace", command }))),
  };
}
