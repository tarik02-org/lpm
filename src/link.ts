import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { LpmConfig } from "./config.ts";
import { findConsumerRoot } from "./consumer/root.ts";
import {
  ConflictingPackageRootsError,
  ConsumerRootNotFoundError,
  PackageManagerChangedError,
  PackageManifestReadError,
} from "./error.ts";
import { materializePackage } from "./materialization/materialize.ts";
import {
  applyConsumerConfiguration,
  planConsumerConfiguration,
  readConsumerConfiguration,
} from "./package-manager/config.ts";
import { detectPackageManager } from "./package-manager/detect.ts";
import { installConsumerDependencies } from "./package-manager/install.ts";
import { configurationStrategyName, hasCompatibleConfiguration } from "./package-manager/schema.ts";
import { readPackageManifest } from "./package/manifest.ts";
import { decodeAbsolutePath, type AbsolutePath, type PackageName } from "./package/schema.ts";
import { loadState, saveState, stateMutationLock } from "./state/store.ts";
import type { ConsumerState, LinkRecord, ManifestMode } from "./state/schema.ts";

export interface LinkInput {
  readonly consumerRoot: string;
  readonly packageRoots: ReadonlyArray<string>;
  readonly manifestMode: ManifestMode;
}

interface ResolvedPackageRoot {
  readonly packageName: PackageName;
  readonly packageRoot: AbsolutePath;
}

const resolvePackageRoot = Effect.fn("Link.resolvePackageRoot")(function* (
  packageRootInput: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const canonicalRootText = yield* fs
    .realPath(packageRootInput)
    .pipe(
      Effect.catchTag("PlatformError", (cause) =>
        Effect.fail(new PackageManifestReadError({ path: packageRootInput, cause })),
      ),
    );
  const packageRoot = yield* decodeAbsolutePath(canonicalRootText).pipe(
    Effect.catchTag("SchemaError", (cause) =>
      Effect.fail(new PackageManifestReadError({ path: packageRootInput, cause })),
    ),
  );
  const manifest = yield* readPackageManifest(packageRoot);
  return { packageName: manifest.name, packageRoot } satisfies ResolvedPackageRoot;
});

export const linkPackages = Effect.fn("Link.linkPackages")(function* (input: LinkInput) {
  if (input.packageRoots.length === 0) {
    return [];
  }

  const config = yield* LpmConfig;
  const path = yield* Path.Path;
  const lpmDirectory = yield* config.getDirectory();
  const consumerRoot = yield* findConsumerRoot(input.consumerRoot);
  const detectedManager = yield* detectPackageManager(consumerRoot);
  const resolvedPackageRoots = yield* Effect.all(input.packageRoots.map(resolvePackageRoot));
  const packages = resolvedPackageRoots.filter(
    (resolved, index, all) =>
      all.findIndex((candidate) => candidate.packageRoot === resolved.packageRoot) === index,
  );
  for (const resolved of packages) {
    const roots = packages
      .filter((candidate) => candidate.packageName === resolved.packageName)
      .map((candidate) => candidate.packageRoot);
    if (roots.length > 1) {
      return yield* new ConflictingPackageRootsError({
        packageName: resolved.packageName,
        packageRoots: roots,
      });
    }
  }

  return yield* Effect.scoped(
    Effect.gen(function* () {
      yield* stateMutationLock(consumerRoot);
      const existingState = yield* loadState(consumerRoot);
      if (
        existingState !== undefined &&
        !hasCompatibleConfiguration(existingState.packageManager, detectedManager)
      ) {
        return yield* new PackageManagerChangedError({
          consumerRoot,
          previous: configurationStrategyName(existingState.packageManager),
          detected: configurationStrategyName(detectedManager),
        });
      }

      const selectedPackageNames = new Set(packages.map((resolved) => resolved.packageName));
      const addedLinks: Array<LinkRecord> = [];
      for (const resolved of packages) {
        const materializedRootText = path.resolve(consumerRoot, lpmDirectory, resolved.packageName);
        const materializedRoot = yield* decodeAbsolutePath(materializedRootText).pipe(
          Effect.catchTag("SchemaError", () =>
            Effect.fail(new ConsumerRootNotFoundError({ startPath: materializedRootText })),
          ),
        );
        const link: LinkRecord = {
          packageName: resolved.packageName,
          packageRoot: resolved.packageRoot,
          materializedRoot,
          manifestMode: input.manifestMode,
        };
        addedLinks.push(link);
        yield* materializePackage({
          sourceRoot: link.packageRoot,
          destinationRoot: link.materializedRoot,
          manifestMode: link.manifestMode,
          manager: detectedManager,
        });
      }
      const links = [
        ...(existingState?.links.filter(
          (candidate) => !selectedPackageNames.has(candidate.packageName),
        ) ?? []),
        ...addedLinks,
      ];
      const currentConfiguration = yield* readConsumerConfiguration(consumerRoot);
      const plan = yield* planConsumerConfiguration({
        consumerRoot,
        manager: detectedManager,
        current: currentConfiguration,
        baselines: existingState?.baselines ?? [],
        links,
      });
      const state: ConsumerState = {
        version: 1,
        packageManager: detectedManager,
        baselines: [...(existingState?.baselines ?? []), ...plan.baselineCaptures],
        links,
      };

      yield* saveState(consumerRoot, state);
      yield* applyConsumerConfiguration(currentConfiguration, plan);
      yield* installConsumerDependencies(consumerRoot, detectedManager);

      return addedLinks;
    }),
  );
});
