# ADR 0001: Use Effect TypeScript

- Status: Accepted
- Date: 2026-08-17

## Context

`lpm` must coordinate filesystem access, package-manager processes, foreground watchers, cancellation, structured output, and persistent state.

The implementation options considered were Effect TypeScript, Rust, and Python.

Rust would produce a standalone binary, but package publication semantics would still require Node and package-manager integration. Python has the same integration cost and adds another runtime to JavaScript package development.

## Decision

Implement `lpm` in Effect TypeScript on Node.js 24.

Use:

- `effect/unstable/cli` for command parsing;
- `@clack/prompts` behind a CLI-local adapter for searchable multi-select prompts;
- `@effect/platform-node` for filesystem and process boundaries;
- `effect/Schema` for persisted and external data;
- `npm-packlist` for npm-compatible package file selection;
- Vite Plus for linting, formatting, and packaging;
- `tsgo` for type checking.

Pin Effect versions exactly while the CLI module is unstable. Keep Effect CLI declarations and the Clack adapter in `src/cli` so CLI and prompt API changes do not affect linking, materialization, or development workflows. Clack supplies searchable multi-select because Effect's current prompt module does not.

## Consequences

`lpm` can call npm ecosystem libraries directly and ships through the same Node toolchain as its target projects.

Long-running work will use scoped Effect resources so cancellation stops filesystem watchers. Package-manager processes remain Effect-managed.

The executable is not a standalone native binary. Node.js remains a runtime dependency.
