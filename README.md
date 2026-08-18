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
echo '/.local/lpm/' >> .gitignore

lpm link ../ui-kit /work/shared/logger
lpm dev

lpm unlink
lpm unlink @acme/ui-kit logger
lpm unlink --all
```

`link` accepts package-root paths containing `package.json`. `dev` watches and copies changes; start source build commands yourself.

Manifest normalization is enabled by default. Use `--verbatim` to copy `package.json` unchanged:

```text
lpm link ../ui-kit --verbatim
```

Supported package managers: npm, pnpm, Yarn, Bun, and Aube.

Run `lpm <command> --help` for command details.

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

## Nix checkout

```text
nix run path:. -- --help
nix registry add lpm path:$PWD
nix run lpm -- --help
```

## Design

- [Project language](CONTEXT.md)
- [Core linking design](docs/core-linking-design.md)
- [Architecture decisions](docs/adr/README.md)
