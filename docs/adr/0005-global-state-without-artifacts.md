# ADR 0005: Keep global state without an artifact store

- Status: Superseded by ADR 0006
- Date: 2026-08-17
- Updated: 2026-08-18

## Context

`lpm` needs global source resolution, stale-package detection, consumer link tracking, and garbage collection.

It does not need package history, offline package generations, deduplication, or rollback. Registered package roots and consumer-local materializations already contain the package bytes needed for development.

## Decision

Persist a versioned JSON state file under the XDG state directory. Serialize mutations with a basic lock and replace the state file atomically after each successful mutation.

The initial state contains:

- source registrations keyed by package and channel;
- consumer links, their package manager, manifest-normalization choice, and the previous values of every workspace, override, resolution, or dependency setting changed by `lpm link`.

Do not store package contents globally. Synchronize publishable files directly from a registered package root to each linked consumer.

Do not add user configuration. `.local/lpm`, XDG state locations, registration rules, and command conventions are fixed by the application.

## Consequences

Garbage collection removes missing-consumer records and stale registrations that no surviving consumer links. It changes only the global state file and does not delete source or materialized files.

Changing fixed paths or adding configuration requires a new architecture decision.
