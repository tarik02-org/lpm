# ADR 0007: Configure the consumer-local directory globally

- Status: Accepted
- Date: 2026-08-18

## Context

State, locks, and materialized packages need one shared root inside each consumer. `.local/lpm` is a sensible default, but projects use different conventions for ignored local data.

An absolute shared directory would mix consumer state or require a global consumer index. Per-command flags could let one operation use a different lock or state file from the next.

## Decision

Read one optional user config file from:

```text
${XDG_CONFIG_HOME:-$HOME/.config}/lpm/config.json
```

The file has one optional setting:

```json
{
  "directory": ".local/lpm"
}
```

The default is `.local/lpm`. `directory` must be non-empty, relative to the consumer root, and normalize to a path inside that root.

Load the config once per process. State, the mutation lock, materializations, package-manager configuration, status, doctor, unlink, and development synchronization use the same resolved directory.

LPM does not edit ignore files, migrate an old directory, or add a config command. Users unlink affected consumers before changing the global directory and relink afterward.

## Consequences

Every consumer follows one user-wide convention while keeping its state local. Commands cannot accidentally select different directories within one process.

Changing the setting is an explicit migration boundary. The old directory and package-manager edits remain until the user unlinks before the change or repairs them manually.
