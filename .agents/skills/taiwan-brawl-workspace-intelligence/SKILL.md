# Taiwan Brawl Workspace Intelligence

Use this repository-local skill when a task spans multiple Taiwan Brawl repositories.

1. Resolve task keywords with `node scripts/taiwan-brawl-intelligence.mjs resolve "<task>"`.
2. Read affected contracts in `data/contracts.json`.
3. Inspect implementation only in the owning repository.
4. Use `impact` before changing a shared API/protocol/package.
5. Use `test-plan` to derive required validation categories.
6. Update workspace snapshot only from verified repository evidence.
