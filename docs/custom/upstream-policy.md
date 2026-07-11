# Upstream Maintenance Policy

## Branches

- `main` mirrors official `QuantumNous/new-api`.
- `custom/main` is the production source branch.
- `sync/upstream-*` branches are created by automation for official releases.
- Feature work is developed on focused `feature/*` branches and merged by PR.

## Releases

- `UPSTREAM_VERSION` stores the reviewed official base tag.
- Production images use immutable tags or digests.
- `latest` is never used by production.
- Official publishing workflows are disabled in `custom/main`.

## Upgrades

Official releases are detected automatically, but production upgrades require:

1. A sync PR.
2. Passing backend, frontend, repository and image checks.
3. Staging deployment and manual validation.
4. Manual production approval.

## Licensing

Keep AGPL, NOTICE and third-party license files. Do not publish images under the official `calciumion/new-api` namespace.
