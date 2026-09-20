#!/usr/bin/env node
import { parseTaskOptions } from "../intelligence/task-options.mjs";
import { executeTaskRun, prepareTaskRun } from "../intelligence/task-runner.mjs";

try {
  const { task, options, execution } = parseTaskOptions(process.argv.slice(2), { runner: true });
  const run = prepareTaskRun(task, options, { cwd: execution.cwd, addDirs: execution.addDirs });
  if (!execution.execute) {
    const { prompt, ...preview } = run;
    console.log(JSON.stringify({ ...preview, promptChars: prompt?.length ?? 0, dryRun: true }, null, 2));
  } else {
    console.error(`Task tier: ${run.plan.modelSelection.tier}; model: ${run.plan.modelSelection.model ?? "none"}; timeout: ${run.plan.modelSelection.timeoutSeconds}s`);
    const result = await executeTaskRun(run);
    console.error(JSON.stringify(result));
    process.exitCode = result.status === "process-completed" ? 0 : result.status === "timeout" ? 124 : 1;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
