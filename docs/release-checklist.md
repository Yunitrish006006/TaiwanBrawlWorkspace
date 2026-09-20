# Release / deploy checklist

This workspace does not authorize or perform production release by itself.

## Frontend

- Verify `pubspec.yaml` version.
- Run `flutter analyze` and `flutter test`.
- Build the actual target(s) required by the release.

## Backend / integrated web deploy

- Run `npm test`.
- Validate `deploy.sh` syntax and intended migration scope.
- Review D1 migrations and Wrangler binding changes.
- Build Flutter Web from the intended frontend commit.
- Generate asset manifest and deploy only when explicitly authorized.
- Run smoke tests and record the exact deployed commit(s).

## Workspace snapshot

After verified changes, refresh `data/repositories.json` and affected contracts/relationships.
