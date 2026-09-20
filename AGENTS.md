# TaiwanBrawlWorkspace agent instructions

TaiwanBrawlWorkspace is the coordination and architecture-knowledge repository for the Taiwan Brawl project family. It is not the production frontend or backend.

## Repository invariants

- Keep `data/repositories.json`, `data/relationships.json`, `data/contracts.json`, and `data/test-matrix.json` internally consistent.
- Repository branch, commit SHA, package version, API behavior, CI state, and deployment state must come from the owning repository or verified runtime evidence; never infer them.
- Cross-repository contracts belong here, but implementation details remain owned by their source repositories.
- Keep dependency classifications distinct: runtime-hard, build-hard, build-orchestration, external-hard, external-runtime.
- Never commit build output, credentials, secrets, Cloudflare tokens, Firebase service credentials, private endpoints, or host-specific absolute paths.

## Active topology

- `taiwan_brawl_front` owns Flutter UX, client-side state, FCM registration/client behavior, and Royale UI.
- `taiwan_brawl_back` owns API contracts, D1 persistence, KV assets, Durable Objects, FCM server delivery, and integrated deployment.
- `user_ui_settings` owns reusable theme/locale/font-scale providers.
- `user_basic_system` owns reusable profile/DM abstractions used by the frontend package graph.

## Contract rules

- DM delivery is currently polling-first through `pending_messages`; do not describe it as socket-first unless both implementation and contract snapshot are deliberately updated.
- Push is a notification channel, not the durable source of truth for direct messages.
- Royale realtime state is owned by `ROYALE_ROOM` Durable Object.
- Web auth may use cookie sessions; non-Web clients may use Bearer `session_id`.
- The backend integrated deploy flow builds the frontend and serves the resulting Flutter Web assets from the Worker/KV path.

## Development lifecycle

For non-trivial cross-repository work:

```text
resolve task
→ identify owning repos/contracts
→ bounded implementation
→ impact analysis
→ test plan
→ actual validation
→ update workspace snapshot only when evidence changed
```

Do not report tests, CI, deploy, publication, or remote state as complete without actual evidence.

## Model tiering and quota use

- Before substantive work, use `node scripts/taiwan-brawl-intelligence.mjs model-plan "<bounded task>"` or `orchestrate` to read the local routing decision. See `docs/model-tiering.md`; `data/model-policy.json` is the sole policy source.
- Use direct deterministic tools for known summary/validation/generation tasks. Keep exploration limited to owning repositories and affected contracts.
- When the client supports model selection, apply the planned model and effort before starting work. Plans do not change the current session's model; never claim they do.
- Do not start a nested Codex session or delegate the same task merely to change models. `scripts/run-task.mjs` is a user-invoked entrypoint for a new task; it defaults to a preview and executes with `--execute`.
- `npm run task:auto -- "<task>"` is the user-invoked execute shortcut. `npm run model-defaults -- --write . ..` installs economy defaults derived from the policy for new sessions in the selected directories; explicit client/CLI selections can override them. Neither command changes an active conversation's model.
- A tier override needs a concrete reason. Escalate one level only with the documented failure evidence; network/authentication/quota/environment failures need diagnosis, not a larger model.
- Reuse passed validation until relevant inputs change. Do not repeat full scans or successful test suites without new evidence, and do not skip required owner/consumer validation to save quota.
- Keep handoffs to changed files, concise failure evidence and actual validation. Never replay the entire conversation as a new prompt.

## Required workspace validation

At minimum, after changing workspace data or docs:

```bash
node scripts/validate-workspace.mjs
npm test
node scripts/render-flutter-data.mjs
```

For production changes, use the owning repository's actual toolchain (`flutter analyze/test`, `npm test`, Wrangler/deploy checks) as required by `data/test-matrix.json`.
