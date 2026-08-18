# LPM linking

LPM connects package roots directly to consumers for local package development. Links belong to one consumer and remain local to that developer's machine.

## Language

**Package root**:
The canonical directory containing the `package.json` for a package managed by LPM. A package root may be inside a larger Git repository or monorepo.

**Package name**:
The npm-compatible name declared by a package root. A consumer has at most one link for a package name.

**Consumer**:
The package-manager workspace root that receives linked packages. In a monorepo, links belong to the workspace root rather than an individual workspace package.

**Link**:
A consumer-owned association from a package name to a package root. The link also owns that consumer's materialization behavior.

**Stashed consumer**:
A consumer whose links are preserved but temporarily resolve each linked package's exact package-root version from the registry instead of local materializations. All links are stashed and unstashed together. Partial stashing does not exist.

**Link commit**:
An irreversible replacement of every consumer link with a registry-backed dependency declaration derived from the package root's version. Committing removes all LPM state and materializations from the consumer.

**Materialization**:
The consumer-local copy of a linked package's publishable files.

**LPM directory**:
The consumer-relative directory containing state, the mutation lock, and materializations. It defaults to `.local/lpm`. One XDG user config setting changes the directory for every consumer.

**Manifest normalization**:
A transformation applied to a materialized package manifest so a source workspace behaves like an installed dependency. It is enabled by default for each link and never changes the package root.

**Development session**:
A foreground consumer-owned process that watches linked package roots and keeps materializations current. The user runs source build processes separately.

## Example

Developer: "Link `../ui-kit` into this consumer."

Domain expert: "LPM reads the package name from that package root and creates or replaces the consumer's link for that name."
