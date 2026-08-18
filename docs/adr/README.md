# Architecture decision records

| ADR                                                             | Status     | Decision                                                             |
| --------------------------------------------------------------- | ---------- | -------------------------------------------------------------------- |
| [0001](0001-use-effect-typescript.md)                           | Accepted   | Implement `lpm` in Effect TypeScript                                 |
| [0002](0002-register-package-roots.md)                          | Superseded | Resolve package channels through registered package roots            |
| [0003](0003-materialize-with-package-manager-overrides.md)      | Accepted   | Materialize packages locally and redirect package-manager resolution |
| [0004](0004-consumer-owned-development-sessions.md)             | Accepted   | Start live development from the consumer process                     |
| [0005](0005-global-state-without-artifacts.md)                  | Superseded | Persist registrations and links without package artifacts            |
| [0006](0006-link-package-roots-directly.md)                     | Accepted   | Link explicit package-root paths and keep state inside each consumer |
| [0007](0007-configure-the-consumer-local-directory-globally.md) | Accepted   | Set the consumer-local LPM directory through one XDG user config     |
| [0008](0008-stash-or-commit-links-to-registry-versions.md)      | Proposed   | Stash links temporarily or commit them to registry versions          |
