# ADR 0004: Run development sessions from consumers

- Status: Accepted
- Date: 2026-08-17
- Updated: 2026-08-18

## Context

Live updates exist to keep a consumer's local package directory current. Starting the update process from every dependency source makes multi-package development difficult to coordinate.

Persistent background processes also require daemon lifecycle, log routing, recovery, and cleanup before the core linking workflow has proven itself.

## Decision

Start live synchronization with `lpm dev` from the consumer project.

The command reads the consumer's links and synchronizes publishable output from their package roots into the configured consumer-local LPM directory.

The user starts each source package's development command separately. LPM does not define a source script name, launch source builders, or own their lifecycle.

`lpm dev` stays in the foreground. Effect scopes own filesystem watchers, so stopping the command stops the session.

The command watches the consumer's LPM state as well as package roots. Linking, unlinking, or replacing a package root rebuilds the affected watcher set while `lpm dev` keeps running. An explicit package selection ignores changes to other links. If all selected packages are temporarily unlinked, the command waits for them to be linked again.

Filesystem changes trigger an `npm-packlist` rescan after a short debounce. Synchronization copies the current publishable files and removes files that are no longer publishable. It does not require a build-ready signal, a quiescent snapshot, or a content hash.

Ordinary content changes stop after synchronization. If synchronization changes a materialized `package.json`, `lpm dev` asks the consumer's package manager to reconcile once after the debounce.

Link, unlink, and development synchronization use the same mutation lock. A development sync reloads state after acquiring the lock and skips events from watchers that are no longer current. This prevents an old watcher from recreating an unlinked materialization.

## Consequences

The terminal that needs live updates owns the synchronization session and its logs. Source build output stays in the user's source-development terminal.

Multiple consumers may watch the same package root independently because LPM does not own the source builder.

There is no background daemon, separate watcher command, pull watcher, source script convention, or stored automatic-watch preference in the initial implementation.

Recursive development across linked package chains needs explicit dependency-graph handling. That behavior will be decided when linked dependencies work end to end.
