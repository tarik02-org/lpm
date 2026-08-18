# ADR 0006: Link package roots directly from each consumer

- Status: Accepted
- Date: 2026-08-18

`lpm link` accepts one or more absolute or relative package-root paths. It resolves relative inputs from the invocation directory, canonicalizes each root, reads its package name, and stores the link inside the configured consumer-local LPM directory. Linking another root with the same package name replaces that consumer's existing link.

Links and their package-manager baselines are uncommitted consumer-local state. LPM has no global registrations, channels, consumer index, or source-discovery configuration. This removes global cleanup and conflicts at the cost of requiring explicit paths when linking. Consumers must ignore their configured LPM directory; LPM does not edit Git ignore files.
