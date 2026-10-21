#!/usr/bin/env node
import { loadWorkspace, resolveTask, impactForRepository, testPlanForTask } from "../intelligence/workspace-knowledge.mjs";
import { buildOrchestrationPlan } from "../intelligence/orchestration-plan.mjs";
import { selectModelTier } from "../intelligence/model-tiering.mjs";
import { parseTaskOptions } from "../intelligence/task-options.mjs";

const [command = "summary", ...rest] = process.argv.slice(2);
const input = rest.join(" ");

try {
  let result;
  if (command === "summary") {
    const workspace = loadWorkspace();
    result = {
      snapshot: workspace.repositories.snapshot,
      repositories: workspace.repositories.repositories.map(({ id, name, kind, version, commit }) => ({
        id,
        name,
        kind,
        version,
        commit: commit ? commit.slice(0, 7) : null,
      })),
      contractCount: workspace.contracts.contracts.length,
      relationshipCount: workspace.relationships.relationships.length,
    };
  } else if (command === "resolve") {
    result = resolveTask(input);
  } else if (command === "impact") {
    result = impactForRepository(input);
  } else if (command === "test-plan") {
    result = testPlanForTask(input);
  } else if (command === "orchestrate" || command === "model-plan") {
    const { task, options } = parseTaskOptions(rest);
    result = command === "orchestrate" ? buildOrchestrationPlan(task, options) : selectModelTier(task, options);
  } else {
    throw new Error(`Unknown command: ${command}\nUse: summary | resolve <task> | impact <repo-id> | test-plan <task> | orchestrate <task> | model-plan <task>`);
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
