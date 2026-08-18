---
name: lpm
description: Use the lpm CLI to link local package-root paths into npm, pnpm, Yarn, Bun, or Aube consumers, synchronize packages during development, inspect and repair consumer links, or unlink packages.
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
