# ADR 0003: Materialize packages through package-manager overrides

- Status: Accepted
- Date: 2026-08-17

## Context

Consumers need local package contents while preserving dependency and peer-dependency resolution. A linked package may be a direct or transitive dependency. Consumers may use npm, pnpm, Yarn, Bun, or Aube.

Direct package-manager links to a package root can make Node resolve dependencies from the wrong directory. A local path may also be treated as an externally managed link or a copied snapshot. The former can omit the package's dependency graph, while the latter does not expose newly materialized files.

The previous workflow avoided source-path resolution problems by copying packages into the consumer before overriding resolution.

## Decision

Materialize linked packages inside each consumer at the fixed path:

```text
.local/lpm/<package name>
```

Scoped packages retain their package path:

```text
.local/lpm/@broken-build-net/jira-utils
```

`lpm link` resolves the supplied package-root path, selects publishable files with `npm-packlist`, and copies them into the consumer.

It then adds a root-level resolution or override that forces the package name to resolve to the materialized directory. This is required even when the package is already a direct dependency. It also permits linking transitive dependencies without changing their dependents.

Detect the package manager from the root `package.json` `packageManager` field. If it is absent, use an unambiguous recognized lockfile. Fail when detection is ambiguous or no supported manager can be found. Detection includes the major version when behavior differs, as it does between Yarn Classic and modern Yarn.

Use the following package-manager integration:

| Package manager  | Exact workspace registration                                         | Forced resolution                                                             |
| ---------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| npm              | Root `package.json` `workspaces`                                     | Root `package.json` `overrides` to the absolute materialized `file:` path     |
| pnpm             | Root `pnpm-workspace.yaml` `packages`                                | Root `pnpm-workspace.yaml` `overrides` to `workspace:*`                       |
| Yarn 2 and later | None                                                                 | Root `package.json` `resolutions` to the relative materialized `portal:` path |
| Yarn 1           | None                                                                 | Root `package.json` `resolutions` to the relative materialized `link:` path   |
| Bun              | Root `package.json` `workspaces`                                     | Root `package.json` `overrides` to `workspace:*`                              |
| Aube             | Root `package.json` `workspaces` or `pnpm-workspace.yaml` `packages` | Matching root `overrides` to the relative materialized `link:` path           |

Add one exact workspace entry per linked package. Do not rely on a `.local/lpm` workspace glob. This keeps scoped and unscoped package paths explicit and works when a manager ignores hidden directories during glob discovery.

npm normalizes workspace dependencies to absolute `file:` paths. Its override must use that same absolute value. When the linked package is already a direct npm dependency, also replace its declared specifier with the same value because npm requires the direct dependency and override to agree.

Aube keeps the consumer's existing supported lockfile format. Choose its workspace and override document to match the project rather than creating `pnpm-workspace.yaml` unconditionally.

The chosen resolution must expose overwrites, additions, and removals in the materialized directory without another install. It must also let the package manager install the materialized package's dependencies and resolve its peers, including peers supplied by another linked package.

Workspace registration is package-manager plumbing. By default, `lpm` normalizes the materialized `package.json` so the package behaves like a registry-installed dependency rather than a source workspace. Normalization excludes development-only dependencies and workspace-only lifecycle behavior while preserving runtime dependencies, peer dependencies, exports, binaries, and registry-install behavior. It changes only the consumer-local materialization, never the package root.

Manifest normalization is a per-link feature that is enabled by default. The CLI interface may allow the user to disable it for packages that intentionally depend on workspace behavior.

Package-manager-specific behavior is limited to detection, reversible workspace and override edits, the npm direct-dependency exception, and the install command. Materialization and ordinary file synchronization remain package-manager independent.

`lpm` records every manifest or workspace setting it changes. `lpm unlink` restores those values and asks the detected package manager to reconcile the installation. Link and unlink do not attempt transactional rollback. If reconciliation fails, the command reports the failure and leaves repair to the user.

Ordinary synchronized file changes do not run the package manager. A synchronized `package.json` change triggers one reconciliation after the same debounce because it may change dependencies, peers, exports, binaries, or install behavior. This comparison does not require a persisted content hash.

ADR 0007 replaces the fixed-location decision. `.local/lpm` remains the default, and one XDG user config setting can change it for every consumer.

## Consequences

The consumer's package manager owns installation and dependency resolution. `lpm` owns source-path links, override management, and package materialization.

Each consumer has its own mutable package copy. Updating one consumer cannot alter another consumer's files.

Support for a package manager requires a working root-level resolution or override to a mutable local directory and correct dependency and peer resolution. A package manager without those capabilities is not supported by the initial implementation.

The compatibility spike verified npm 11.16, pnpm 10.33 and 11.22, Yarn 1.22 and 4.18, Bun 1.3, and Aube 1.41. These versions are evidence for the selected mechanisms, not permanent version pins.
