# Development guidelines

1. Start from the owning repository, not the workspace snapshot, for implementation details.
2. Treat API/schema/protocol edits as cross-repo changes and inspect every listed consumer.
3. Keep generated outputs out of Git unless explicitly designated as viewer data.
4. Never treat a required test command as evidence that it passed.
5. Update snapshot SHAs only after re-reading the owning repository head.
6. Prefer small contract-preserving changes before large architecture migrations.
7. A polling-to-WebSocket DM migration must update frontend ChatService, backend chat contract, tests, docs, and this workspace together.
