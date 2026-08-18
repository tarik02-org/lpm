# ADR 0002: Register package roots by package and channel

- Status: Superseded by ADR 0006
- Date: 2026-08-17
- Updated: 2026-08-18

## Context

A consumer should link a local dependency by name and channel without knowing its filesystem path.

The package version is not a useful local identifier. Several package roots can contain the same package version while exposing different changes.

## Decision

`lpm register` creates a global mapping:

```text
package name + channel -> package root
```

The package name comes from the package root's `package.json`. Store only the canonical package-root path. Do not persist the Git repository root or Git worktree metadata.

Without `--channel`, registration uses the current Git branch name. Registration from a detached HEAD requires an explicit channel. Derived and explicit channels must pass the same safe-name validation.

The key is unique within a package. A live package and channel pair has one registered package root. Re-registering the same root is idempotent. Registering another live root for the same key fails.

Consumers resolve registrations with syntax such as:

```text
@broken-build-net/jira-utils@ARG-4190-branded-types
```

Registration stores the package name, channel, and canonical package-root path. It does not publish or copy package content.

`lpm unregister` removes a registration only when no consumer links it. The user must unlink every consumer first. Unregistering changes global state only; it does not remove package roots or consumer materializations.

## Consequences

Each package root registers once instead of publishing after every build.

Branch names become stable local channels. Renaming a branch creates a new channel registration and leaves the old registration available for garbage collection.

A missing or moved package root makes the registration stale. `lpm status --global` reports it and `lpm gc --apply` can remove it when no consumer link depends on it.
