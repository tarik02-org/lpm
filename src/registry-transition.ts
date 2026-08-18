import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { valid } from "semver";

import { findConsumerRoot } from "./consumer/root.ts";
import {
  CommitDependencyMissingError,
  ConsumerAlreadyStashedError,
  ConsumerHasNoLinksError,
  ConsumerNotStashedError,
  MaterializationWriteError,
  PackageManagerChangedError,
  StashedMutationRequiresForceError,
  UnsupportedCommitDependencySpecifierError,
} from "./error.ts";
import {
  applyConsumerConfiguration,
  planConsumerConfiguration,
  readConsumerConfiguration,
  type CommittedDependency,
  type ConsumerConfiguration,
  type DependencySection,
  type StashedPackageLink,
} from "./package-manager/config.ts";
import { detectPackageManager } from "./package-manager/detect.ts";
import { installConsumerDependencies } from "./package-manager/install.ts";
import {
  configurationStrategyName,
  hasCompatibleConfiguration,
  type DetectedPackageManager,
} from "./package-manager/schema.ts";
import { readPackageManifest } from "./package/manifest.ts";
import type { AbsolutePath, PackageName, PackageVersion } from "./package/schema.ts";
import type { ConsumerState } from "./state/schema.ts";
import { loadState, removeState, saveState, stateMutationLock } from "./state/store.ts";

export interface CommitInput {
  readonly consumerRoot: string;
  readonly force: boolean;
}

export interface RegistryTransitionResult {
  readonly packages: ReadonlyArray<{
    readonly packageName: PackageName;
    readonly version: PackageVersion;
  }>;
}

const dependencySections: ReadonlyArray<DependencySection> = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
];

const checkPackageManager = Effect.fn("RegistryTransition.checkPackageManager")(function* (
  consumerRoot: AbsolutePath,
  state: ConsumerState,
  detectedManager: DetectedPackageManager,
) {
  if (!hasCompatibleConfiguration(state.packageManager, detectedManager)) {
    yield* new PackageManagerChangedError({
      consumerRoot,
      previous: configurationStrategyName(state.packageManager),
      detected: configurationStrategyName(detectedManager),
    });
  }
});

const readLinkedVersions = Effect.fn("RegistryTransition.readLinkedVersions")(function* (
  state: ConsumerState,
) {
  const packages: Array<StashedPackageLink> = [];
  for (const link of state.links) {
    const manifest = yield* readPackageManifest(link.packageRoot);
    packages.push({ link, version: manifest.version });
  }
  return packages;
});

const stateVersions = (packages: ReadonlyArray<StashedPackageLink>) => {
  const versions: Record<string, PackageVersion> = {};
  for (const entry of packages) {
    versions[entry.link.packageName] = entry.version;
  }
  return versions;
};

const stashedPackages = (state: ConsumerState): ReadonlyArray<StashedPackageLink> => {
  if (state.mode.kind === "active") {
    return [];
  }
  return Object.entries(state.mode.versions).flatMap(([packageName, version]) =>
    state.links
      .filter((link) => link.packageName === packageName)
      .map((link) => ({ link, version })),
  );
};

const preLinkDependencySpecifier = (
  state: ConsumerState,
  current: ConsumerConfiguration,
  packageName: PackageName,
  section: DependencySection,
) => {
  const baseline = state.baselines.find(
    (candidate) =>
      candidate.kind === "package-json-dependency" &&
      candidate.packageName === packageName &&
      candidate.section === section,
  );
  if (baseline?.kind === "package-json-dependency") {
    return baseline.previous.kind === "present" ? baseline.previous.value : undefined;
  }
  return current.packageJson[section]?.[packageName];
};

const committedDependencies = Effect.fn("RegistryTransition.committedDependencies")(function* (
  state: ConsumerState,
  current: ConsumerConfiguration,
  packages: ReadonlyArray<StashedPackageLink>,
) {
  const dependencies: Array<CommittedDependency> = [];
  for (const entry of packages) {
    let found = false;
    for (const section of dependencySections) {
      const specifier = preLinkDependencySpecifier(state, current, entry.link.packageName, section);
      if (specifier === undefined) {
        continue;
      }
      found = true;
      const prefix = specifier.startsWith("^") ? "^" : specifier.startsWith("~") ? "~" : "";
      const previousVersion = prefix.length === 0 ? specifier : specifier.slice(1);
      if (valid(previousVersion) !== previousVersion) {
        return yield* new UnsupportedCommitDependencySpecifierError({
          packageName: entry.link.packageName,
          section,
          specifier,
        });
      }
      dependencies.push({
        packageName: entry.link.packageName,
        section,
        value: `${prefix}${entry.version}`,
      });
    }
    if (!found) {
      return yield* new CommitDependencyMissingError({
        packageName: entry.link.packageName,
      });
    }
  }
  return dependencies;
});

export const stashConsumer = Effect.fn("RegistryTransition.stash")(function* (
  consumerStart: string,
) {
  const consumerRoot = yield* findConsumerRoot(consumerStart);
  const detectedManager = yield* detectPackageManager(consumerRoot);

  return yield* Effect.scoped(
    Effect.gen(function* () {
      yield* stateMutationLock(consumerRoot);
      const state = yield* loadState(consumerRoot);
      if (state === undefined || state.links.length === 0) {
        return yield* new ConsumerHasNoLinksError({ consumerRoot });
      }
      yield* checkPackageManager(consumerRoot, state, detectedManager);
      if (state.mode.kind === "stashed") {
        return yield* new ConsumerAlreadyStashedError({ consumerRoot });
      }

      const packages = yield* readLinkedVersions(state);
      const current = yield* readConsumerConfiguration(consumerRoot);
      const plan = yield* planConsumerConfiguration({
        consumerRoot,
        manager: detectedManager,
        current,
        baselines: state.baselines,
        target: { kind: "stashed", packages },
      });
      yield* saveState(consumerRoot, {
        ...state,
        packageManager: detectedManager,
        baselines: [...state.baselines, ...plan.baselineCaptures],
        mode: { kind: "stashed", versions: stateVersions(packages) },
      });
      yield* applyConsumerConfiguration(current, plan);
      yield* installConsumerDependencies(consumerRoot, detectedManager);

      return {
        packages: packages.map((entry) => ({
          packageName: entry.link.packageName,
          version: entry.version,
        })),
      } satisfies RegistryTransitionResult;
    }),
  );
});

export const unstashConsumer = Effect.fn("RegistryTransition.unstash")(function* (
  consumerStart: string,
) {
  const consumerRoot = yield* findConsumerRoot(consumerStart);
  const detectedManager = yield* detectPackageManager(consumerRoot);

  return yield* Effect.scoped(
    Effect.gen(function* () {
      yield* stateMutationLock(consumerRoot);
      const state = yield* loadState(consumerRoot);
      if (state === undefined || state.links.length === 0) {
        return yield* new ConsumerHasNoLinksError({ consumerRoot });
      }
      yield* checkPackageManager(consumerRoot, state, detectedManager);
      if (state.mode.kind === "active") {
        return yield* new ConsumerNotStashedError({ consumerRoot });
      }

      const packages = stashedPackages(state);
      const current = yield* readConsumerConfiguration(consumerRoot);
      const plan = yield* planConsumerConfiguration({
        consumerRoot,
        manager: detectedManager,
        current,
        baselines: state.baselines,
        target: { kind: "active", links: state.links },
      });
      yield* saveState(consumerRoot, {
        ...state,
        packageManager: detectedManager,
        mode: { kind: "active" },
      });
      yield* applyConsumerConfiguration(current, plan);
      yield* installConsumerDependencies(consumerRoot, detectedManager);

      return {
        packages: packages.map((entry) => ({
          packageName: entry.link.packageName,
          version: entry.version,
        })),
      } satisfies RegistryTransitionResult;
    }),
  );
});

export const commitConsumer = Effect.fn("RegistryTransition.commit")(function* (
  input: CommitInput,
) {
  const fs = yield* FileSystem.FileSystem;
  const consumerRoot = yield* findConsumerRoot(input.consumerRoot);
  const detectedManager = yield* detectPackageManager(consumerRoot);

  return yield* Effect.scoped(
    Effect.gen(function* () {
      yield* stateMutationLock(consumerRoot);
      const state = yield* loadState(consumerRoot);
      if (state === undefined || state.links.length === 0) {
        return yield* new ConsumerHasNoLinksError({ consumerRoot });
      }
      yield* checkPackageManager(consumerRoot, state, detectedManager);
      if (state.mode.kind === "stashed" && !input.force) {
        return yield* new StashedMutationRequiresForceError({ consumerRoot });
      }

      const packages = yield* readLinkedVersions(state);
      const current = yield* readConsumerConfiguration(consumerRoot);
      const dependencies = yield* committedDependencies(state, current, packages);
      const plan = yield* planConsumerConfiguration({
        consumerRoot,
        manager: detectedManager,
        current,
        baselines: state.baselines,
        target: { kind: "committed", dependencies },
      });

      if (state.mode.kind === "stashed") {
        yield* saveState(consumerRoot, {
          ...state,
          packageManager: detectedManager,
          mode: { kind: "active" },
        });
      }
      yield* applyConsumerConfiguration(current, plan);
      yield* installConsumerDependencies(consumerRoot, detectedManager);
      for (const link of state.links) {
        yield* fs
          .remove(link.materializedRoot, { force: true, recursive: true })
          .pipe(
            Effect.catchTag("PlatformError", (cause) =>
              Effect.fail(new MaterializationWriteError({ path: link.materializedRoot, cause })),
            ),
          );
      }
      yield* removeState(consumerRoot);

      return {
        packages: packages.map((entry) => ({
          packageName: entry.link.packageName,
          version: entry.version,
        })),
      } satisfies RegistryTransitionResult;
    }),
  );
});
