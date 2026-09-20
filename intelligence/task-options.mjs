const modelFlags = {
  "--tier": "tier", "--reason": "reason", "--failed-attempts": "failedAttempts",
  "--failure-kind": "failureKind", "--evidence": "evidence", "--handoff": "handoff",
};

export function parseTaskOptions(args, { runner = false } = {}) {
  const options = {};
  const execution = { execute: false, addDirs: [] };
  const task = [];
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") { task.push(...args.slice(i + 1)); break; }
    if (!arg.startsWith("--")) { task.push(arg); continue; }
    if (seen.has(arg) && !(runner && arg === "--add-dir")) throw new Error(`Duplicate option: ${arg}`);
    seen.add(arg);
    if (runner && arg === "--execute") { execution.execute = true; continue; }
    const key = modelFlags[arg] ?? (runner && arg === "--cwd" ? "cwd" : runner && arg === "--add-dir" ? "addDir" : null);
    if (!key) throw new Error(`Unknown option: ${arg}`);
    const value = args[++i];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
    if (key === "cwd") execution.cwd = value;
    else if (key === "addDir") execution.addDirs.push(value);
    else if (key === "failedAttempts") {
      if (!/^\d+$/.test(value)) throw new Error("--failed-attempts must be a nonnegative integer");
      options[key] = Number(value);
    } else options[key] = value;
  }
  return { task: task.join(" "), options, execution };
}
