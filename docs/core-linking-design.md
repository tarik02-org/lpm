# Core linking design

- Status: Working design
- Date: 2026-08-18

## Scope

The core workflow is:

```text
link package-root paths -> synchronize -> unlink
```

Status and doctor operate on the same consumer-local links. Recursive linked-package traversal and source build processes remain out of scope.

## Invariants

- A consumer is the canonical package-manager workspace root.
- A package root is a canonical directory containing `package.json`.
- A consumer has at most one link for a package name.
- Linking the same package root again is idempotent.
- Linking another root with the same package name replaces the link.
- Relative package-root paths resolve from the invocation directory before consumer-root discovery.
- Package-manager configuration is derived from the complete active-link set.
- The first link captures configuration baselines. The last unlink restores them.
- Link, unlink, doctor repair, and development synchronization share one consumer-local mutation lock.
- Mutations are repairable and idempotent. They do not promise rollback.

## Consumer-local state

State lives at `<LPM directory>/.state.json`. The mutation lock lives at `<LPM directory>/.mutation.lock`. Both belong to the consumer and must remain uncommitted.

Decode the complete state file with Effect Schema at the filesystem boundary.

```ts
interface ConsumerState {
  readonly version: 1;
  readonly packageManager: DetectedPackageManager;
  readonly baselines: ReadonlyArray<ManagedFieldBaseline>;
  readonly links: ReadonlyArray<LinkRecord>;
}

interface LinkRecord {
  readonly packageName: PackageName;
  readonly packageRoot: AbsolutePath;
  readonly materializedRoot: AbsolutePath;
  readonly manifestMode: "normalized" | "verbatim";
}
```

Arrays keep the persisted format simple. State decoding rejects duplicate package names.

The LPM directory defaults to `.local/lpm`. LPM reads a global `directory` setting from `${XDG_CONFIG_HOME:-$HOME/.config}/lpm/config.json` when the file exists. The value is relative to each consumer root and cannot escape it. The process reads this setting once so every operation uses one location for its state, lock, and materializations.

LPM has no global link state, source catalog, or Git integration. The user adds the configured LPM directory to each consumer's ignore rules.

## Package-manager configuration

Package-manager detection uses the root `package.json` `packageManager` field first, then an unambiguous recognized lockfile. The supported strategies are npm, pnpm, Yarn Classic, modern Yarn, Bun, and Aube.

Manager-specific planning returns typed edits and one install invocation. It does not write files or launch processes. The document boundary applies those edits while preserving unrelated fields, formatting, comments, and newline style.

The planner receives the detected manager, decoded current configuration, stored baselines, and complete prospective link set. It returns final values for every LPM-managed field. Replacing or unlinking a package therefore cannot remove configuration needed by another link.

A baseline distinguishes a missing field from a present value. Shared workspace, override, and resolution baselines remain until the final link is removed. A direct npm dependency baseline belongs to its package name.

## Materialization

Materializations live at `<LPM directory>/<package name>`. Scoped names retain their package path.

The materializer uses `npm-packlist`, copies the current publishable file set, removes files that left that set, and optionally normalizes the copied manifest. Normalization is enabled by default and never changes the package root.

```ts
interface MaterializeInput {
  readonly sourceRoot: AbsolutePath;
  readonly destinationRoot: AbsolutePath;
  readonly manifestMode: "normalized" | "verbatim";
  readonly manager: DetectedPackageManager;
}
```

## Workflows

### Link

1. Require one or more package-root paths.
2. Resolve relative paths from the invocation directory, canonicalize each root, and decode its manifest.
3. Reject two supplied roots that declare the same package name.
4. Find the consumer root and detect its package manager.
5. Acquire the consumer mutation lock and load its state.
6. Materialize every supplied package.
7. Replace existing links by package name and plan configuration from the full prospective link set.
8. Persist links and newly captured baselines.
9. Apply configuration and run one package-manager install.

State is saved before configuration. If configuration or installation fails, rerunning link or doctor can repair it.

### Unlink

1. Find the consumer root and acquire its mutation lock.
2. Resolve the requested package names from current links. With no arguments, the CLI provides a searchable multi-select.
3. Plan configuration from stored baselines and the remaining links.
4. Apply configuration and run one package-manager install.
5. Remove selected materializations.
6. Save the remaining links, or remove `.state.json` after the last unlink.

State remains unchanged until configuration and installation succeed. The user repairs a failed reconciliation and reruns unlink.

### Development synchronization

`lpm dev` watches all current links or an explicit package-name subset. It also watches `.state.json`, so link replacement and unlink update the watcher set without ending the process.

Filesystem events trigger a publishable-file rescan after a 100 ms debounce. A synchronization that changes a copied `package.json` runs one package-manager install. Other changes only copy files.

The user owns source build commands. LPM neither starts nor manages them.

### Status and doctor

`lpm status` reports the current consumer's package-manager strategy, package roots, materialized roots, and path health. It is read-only.

`lpm doctor` also detects configuration drift and exits unsuccessfully when it finds an issue. `lpm doctor --fix` rebuilds materializations, reapplies managed configuration, and runs one install. A missing source path or incompatible package-manager strategy needs user repair.

## Module boundaries

- `src/config.ts` loads and validates the global LPM-directory setting.
- `src/cli` parses commands, renders output, and owns the Clack prompt adapter.
- `src/state` owns consumer-local schema, atomic writes, watching, and locking.
- `src/package` owns package names and manifest decoding.
- `src/consumer` finds the package-manager workspace root.
- `src/package-manager` detects managers, plans and applies configuration, and installs.
- `src/materialization` selects and copies publishable package files.
- Top-level workflow modules compose those boundaries with `Effect.fn`.

Keep workflows as functions while they have one implementation. Add a service only when dependency injection or a second adapter is real.
