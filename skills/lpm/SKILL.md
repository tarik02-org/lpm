---
name: lpm
description: Use the lpm CLI in npm, pnpm, Yarn, Bun, or Aube consumers to link, watch, stash, unstash, commit, inspect, repair, or unlink local packages.
---

# lpm

Run LPM commands from the intended consumer workspace. Consult `lpm --help` or `lpm <command> --help` when syntax may have changed.

## Inspect before mutation

1. Find the consumer's package-manager workspace root.
2. Inspect its `package.json`, package-manager declaration, lockfile, ignore rules, and existing changes.
3. Resolve each source directory containing `package.json` and read its package name.
4. Read `${XDG_CONFIG_HOME:-$HOME/.config}/lpm/config.json` when it exists. Resolve its `directory` from the consumer root, or use `.local/lpm` by default.
5. Confirm the consumer ignores the resolved LPM directory. Ask the user to add that rule when missing. LPM does not edit Git ignore files.

Finish when the consumer root, package roots, and package names are unambiguous.

## Link package roots

Pass one or more relative or absolute package-root paths:

```text
lpm link ../ui-kit /work/shared/logger
```

Relative paths resolve from the command's invocation directory. LPM canonicalizes each path and uses the package name from its `package.json`. Another root with the same package name replaces the current consumer link.

Keep manifest normalization enabled unless the user explicitly needs the source manifest copied unchanged:

```text
lpm link ../ui-kit --verbatim
```

Expect LPM to copy publishable files under the configured LPM directory, update root package-manager configuration, persist its `.state.json`, and run one install. Inspect the consumer diff and materialized package after linking.

## Synchronize development

Start source build commands separately, then run from the consumer:

```text
lpm dev [<package>...]
```

Omit package names to follow every current link. Link replacement and unlink update the watcher set while `lpm dev` remains running. Stop it with the foreground process.

## Switch between local and registry packages

Stash every link at the exact version in its source `package.json`:

```text
lpm stash
```

Stash keeps links and materializations, removes local package-manager resolution, and runs one install. Use it when consumer changes must resolve published packages temporarily. `status` and `doctor` remain available while stashed.

Restore every stashed local link:

```text
lpm unstash
```

Unstash restores local resolution and runs one install.

Permanently replace every link with its source version:

```text
lpm commit
```

Commit requires every linked package in root `dependencies`, `devDependencies`, or `optionalDependencies`. It accepts exact, caret, and tilde semver declarations, preserves that prefix, runs one install, then removes LPM state and materializations.

While stashed, `link`, `unlink`, `dev`, and `commit` discard the stash before proceeding. In noninteractive work, pass `--force` only when the user explicitly authorizes discarding it. Otherwise stop and ask. Interactive LPM sessions ask for confirmation.

## Inspect and repair

Run the read-only commands from the consumer:

```text
lpm status
lpm doctor
```

Treat missing source or materialized paths, a changed package-manager strategy, and configuration drift as findings. Move a source link by running `lpm link <new-path>` again.

Use repair only when the user requests it:

```text
lpm doctor --fix
```

Repair rebuilds materializations, reapplies managed package-manager configuration, and runs one install. A missing source or incompatible package-manager strategy still needs user repair.

When the consumer is stashed, repair keeps it stashed and reapplies exact registry versions.

## Unlink packages

Pass package names, remove every link, or omit arguments for a searchable multi-select:

```text
lpm unlink <package> [<package>...]
lpm unlink --all
lpm unlink
```

Choose package names or `--all`, never both. Unlink restores managed configuration, runs one install, and removes selected materializations. After the last unlink, LPM removes `.state.json`.

If reconciliation fails, report the failed stage and leave repair or a rerun to the user.

## Report mutations

Report the consumer root, resolved package names and roots, command result, install result, and consumer files changed.
