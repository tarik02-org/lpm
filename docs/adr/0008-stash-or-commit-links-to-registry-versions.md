# ADR 0008: Stash or commit links to registry versions

- Status: Proposed
- Date: 2026-08-18

## Context

Local resolution values such as `portal:./.local/lpm/...` are useful during development but unsuitable for a pull request. Two registry-backed transitions are needed:

- Pull requests may need exact published milestone versions while preserving local links for later use.
- Merge and publishing work may need permanent dependency bumps followed by complete link removal.

These transitions must preserve consumer-owned configuration that existed before LPM linked the packages.

## Decision

Add three consumer-wide commands. They never select individual links and read versions only from linked package-root `package.json` files. They do not query a registry. Before changing files, they validate every required package name, version, and dependency specifier. A missing or invalid version fails the command unchanged. Valid versions include semver prereleases.

### `lpm stash`

Temporarily switch every link to its exact package-root version from the registry. Replace each LPM-owned local override or resolution with that exact version and remove LPM-owned workspace registration. Preserve the links, baselines, and materializations, and mark the consumer as stashed. Transitive links are allowed because the exact registry resolution does not require a direct consumer dependency.

Use the package manager's existing override location:

| Package manager | Stashed registry resolution                 |
| --------------- | ------------------------------------------- |
| npm             | `package.json` `overrides`                  |
| pnpm            | `pnpm-workspace.yaml` overrides             |
| Yarn            | `package.json` `resolutions`                |
| Bun             | `package.json` `overrides`                  |
| Aube            | The override document selected when linking |

npm also requires any matching direct dependency declaration to use the exact version while stashed because npm requires direct dependencies and overrides to agree. `unstash` restores npm's local `file:` declaration.

Run one package-manager install after applying the stashed configuration.

### `lpm unstash`

Restore local workspace registration, resolutions, overrides, and npm dependency values from the preserved links and baselines. Clear the stashed marker and run one package-manager install.

Calling `stash` on an already stashed consumer or `unstash` on an active consumer fails.

While stashed, read-only `status`, `doctor`, and `unstash` remain available. Other commands that mutate links, materializations, or configuration require `--force` in noninteractive use or confirmation in interactive use. Proceeding discards the stash and lets the requested command recompute its normal configuration from current links and baselines. `doctor --fix` repairs the stashed configuration without activating local links.

### `lpm commit`

Permanently replace every link with registry-backed dependency declarations. Every linked package must appear in the root `dependencies`, `devDependencies`, or `optionalDependencies`; otherwise the command fails unchanged. Rewrite every matching declaration from the package-root version while preserving only these supported forms:

```text
2.0.0  -> 2.1.0
^2.0.0 -> ^2.1.0
~2.0.0 -> ~2.1.0
```

Any other specifier form fails unchanged. `peerDependencies` are not changed.

Restore pre-link workspace, override, and resolution baselines rather than deleting consumer-owned values. Run one package-manager install. After a successful install, remove every materialization and the consumer's LPM state. `commit` is irreversible and does not ask for confirmation.

If `commit` runs while stashed, it requires `--force` or interactive confirmation and discards the stash before committing. Link, unlink, stash, unstash, and commit remain repairable rather than transactional. A failed install reports the error and leaves state available for repair or a retry.

## Consequences

`stash` produces commit-safe milestone resolutions without losing local link paths. `commit` produces normal dependency declarations and removes LPM ownership entirely.

The all-links boundary avoids mixed local and registry modes. Constraint rewriting stays predictable by rejecting complex ranges, workspace protocols, tags, URLs, and catalogs.
