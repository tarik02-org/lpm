# lpm

Link local packages into a consumer project without global registration or state. LPM copies publishable files and configures package-manager overrides.

## Install

```text
npm install --global @tarik02/lpm
# or
nix profile install github:tarik02-org/lpm
```

## Use

Run LPM from the consumer project:

```text
lpm link ../ui-kit /work/shared/logger
lpm dev
```

`link` accepts package-root paths containing `package.json`. `dev` watches and copies changes; start source build commands yourself.

Manifest normalization is enabled by default. Use `--verbatim` to copy `package.json` unchanged:

```text
lpm link ../ui-kit --verbatim
```

Supported package managers: npm, pnpm, Yarn, Bun, and Aube.

Run `lpm <command> --help` for command details.

## Ignore local files

LPM writes to `.local/lpm` by default. Keep `.local` out of Git using one of:

- Add `.local/` to `${XDG_CONFIG_HOME:-$HOME/.config}/git/ignore` to ignore it globally (`core.excludesFile`).
- Add `/.local/` to the project's `.gitignore`.
- Add `/.local/` to `.git/info/exclude` for the current checkout only.

If you configure another LPM directory, ignore that path instead.

## CLI cheatsheet

| Command                      | Action                                                  |
| ---------------------------- | ------------------------------------------------------- |
| `lpm link <path>...`         | Link package roots and run install                      |
| `lpm link <path> --verbatim` | Link without normalizing the materialized manifest      |
| `lpm dev [package...]`       | Watch and copy all links or selected packages           |
| `lpm stash`                  | Use exact source versions from the registry temporarily |
| `lpm unstash`                | Restore all local links                                 |
| `lpm commit`                 | Write source versions to dependencies and remove links  |
| `lpm unlink [package...]`    | Select links interactively or unlink named packages     |
| `lpm unlink --all`           | Unlink every package                                    |
| `lpm status`                 | Show link mode, package manager, paths, and health      |
| `lpm doctor`                 | Report missing paths and package-manager configuration  |
| `lpm doctor --fix`           | Rebuild materializations, repair configuration, install |

While stashed, `link`, `unlink`, `dev`, and `commit` ask before discarding the stash. Pass `--force` in noninteractive use.

## Configuration

The optional global config is `${XDG_CONFIG_HOME:-$HOME/.config}/lpm/config.json`:

```json
{
  "directory": ".cache/lpm"
}
```

`directory` defaults to `.local/lpm` and must stay inside the consumer root. Add it to the consumer's ignore rules. To change it after linking, unlink first and relink afterward.

## Troubleshooting

```text
lpm status
lpm doctor
lpm doctor --fix
```

If an install fails, fix the reported problem and rerun the command or use `doctor --fix`. If a source moves, link its new path.

## Design

- [Project language](CONTEXT.md)
- [Core linking design](docs/core-linking-design.md)
- [Architecture decisions](docs/adr/README.md)
