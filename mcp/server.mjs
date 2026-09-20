#!/usr/bin/env node
import readline from "node:readline";
import { resolveTask, impactForRepository, testPlanForTask } from "../intelligence/workspace-knowledge.mjs";

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  try {
    const req = JSON.parse(line);
    let result;
    if (req.method === "resolve") result = resolveTask(req.params?.task ?? "");
    else if (req.method === "impact") result = impactForRepository(req.params?.repository ?? "");
    else if (req.method === "testPlan") result = testPlanForTask(req.params?.task ?? "");
    else throw new Error(`unknown method: ${req.method}`);
    process.stdout.write(JSON.stringify({ id: req.id ?? null, result }) + "\n");
  } catch (error) {
    process.stdout.write(JSON.stringify({ error: String(error.message ?? error) }) + "\n");
  }
}
