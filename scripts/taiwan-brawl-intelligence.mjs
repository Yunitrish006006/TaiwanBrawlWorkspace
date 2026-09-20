#!/usr/bin/env node
import { loadWorkspace, resolveTask, impactForRepository, testPlanForTask } from "../intelligence/workspace-knowledge.mjs";
import { buildOrchestrationPlan } from "../intelligence/orchestration-plan.mjs";

const [command = "summary", ...rest] = process.argv.slice(2);
const input = rest.join(" ");
const workspace = loadWorkspace();

if (command === "summary") {
  console.log(JSON.stringify({
    snapshot: workspace.repositories.snapshot,
    repositories: workspace.repositories.repositories.map(({ id, name, kind, version, commit }) => ({ id, name, kind, version, commit: commit.slice(0, 7) })),
    contractCount: workspace.contracts.contracts.length,
    relationshipCount: workspace.relationships.relationships.length,
  }, null, 2));
} else if (command === "resolve") {
  console.log(JSON.stringify(resolveTask(input), null, 2));
} else if (command === "impact") {
  console.log(JSON.stringify(impactForRepository(input), null, 2));
} else if (command === "test-plan") {
  console.log(JSON.stringify(testPlanForTask(input), null, 2));
} else if (command === "orchestrate") {
  console.log(JSON.stringify(buildOrchestrationPlan(input), null, 2));
} else {
  console.error(`Unknown command: ${command}`);
  console.error("Use: summary | resolve <task> | impact <repo-id> | test-plan <task> | orchestrate <task>");
  process.exit(2);
}
