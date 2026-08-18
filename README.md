# lpm

`lpm` links local package roots into a consumer project. It copies each package's publishable files into the consumer and redirects the consumer's package manager to that copy.

Links are explicit and consumer-owned. There is no registration step, global catalog, channel, daemon, or global state.

## Installation

Install the `lpm` command from npm:

```text
npm install --global @tarik02/lpm
```

Or install it with Nix:

```text
nix profile install github:tarik02-org/lpm
```

## Basic use

From the consumer project:

```text
# Keep the default LPM directory out of Git.
echo '/.local/lpm/' >> .gitignore

# Relative and absolute package-root paths both work.
lpm link ../ui-kit /work/shared/logger

# Start source build commands yourself, then keep their output synchronized.
lpm dev

# Inspect or repair this consumer.
lpm status
lpm doctor
lpm doctor --fix

# Select linked packages in a searchable prompt, name them, or remove all.
lpm unlink
lpm unlink @acme/ui-kit logger
lpm unlink --all
```

`lpm link` accepts one or more directories containing `package.json`. Relative paths resolve from the directory where the command runs. With the default configuration, LPM stores their canonical absolute paths in `.local/lpm/.state.json`.

The package name from `package.json` identifies a link. Linking another root with the same package name replaces that consumer's existing link.

Manifest normalization is enabled by default. It removes source-workspace-only behavior from the copied manifest while preserving installed-package behavior. Use `--verbatim` only when the copied `package.json` must remain unchanged:

```text
lpm link ../ui-kit --verbatim
```

LPM supports npm, pnpm, Yarn, Bun, and Aube. It uses the package manager only to install after configuration or dependency changes. Ordinary development synchronization copies files without reinstalling.

## Global configuration

LPM reads one optional XDG user config file:

```text
${XDG_CONFIG_HOME:-$HOME/.config}/lpm/config.json
```

Change the consumer-relative LPM directory for every command and consumer with:

```json
{
  "directory": ".cache/lpm"
}
```

The default is `.local/lpm`. The configured path must be relative, non-empty, and stay inside each consumer root. Add the matching root-relative directory to every consumer's ignore rules.

Set the directory before creating links. To change it later, unlink affected consumers first, update the config, then relink them. LPM does not migrate or clean the previous directory.

## State and recovery

Each consumer stores its links, package-manager baselines, mutation lock, and materializations under the configured LPM directory. LPM does not edit Git files.

Link and unlink operations are repairable, not transactional. If a package-manager install fails, fix the reported problem and rerun the command or use `lpm doctor --fix`. If a linked source moves, link its new path again.

## CLI

```text
lpm link <package-root>... [--verbatim]
lpm unlink [<package>...] [--all]
lpm dev [<package>...]
lpm status
lpm doctor [--fix]
```

Run `lpm --help` or `lpm <command> --help` for live syntax.

## Nix

Run the checkout directly:

```text
nix run path:. -- --help
```

Add the checkout to your user registry to run it as `lpm`:

```text
nix registry add lpm path:$PWD
nix run lpm -- --help
```

The Nix package installs Bash, Fish, and Zsh completions with the `lpm` executable.

## Releases

Add a Changeset for each releasable change:

```text
pnpm changeset
```

Pushes to `main` update a release pull request or publish `@tarik02/lpm`, create the Git tag, and create the GitHub release. The repository needs `APP_CLIENT_ID`, `APP_PRIVATE_KEY`, and `NPM_TOKEN` configured with the same GitHub App and npm permissions as the release workflow.

## Design

- [Project language](CONTEXT.md)
- [Core linking design](docs/core-linking-design.md)
- [Architecture decisions](docs/adr/README.md)
