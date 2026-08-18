import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { findConsumerRoot } from "./consumer/root.ts";
import {
  ConsumerHasNoLinksError,
  ConsumerNotLinkedError,
  MaterializationWriteError,
  PackageManagerChangedError,
} from "./error.ts";
import {
  applyConsumerConfiguration,
  planConsumerConfiguration,
  readConsumerConfiguration,
} from "./package-manager/config.ts";
import { detectPackageManager } from "./package-manager/detect.ts";
import { installConsumerDependencies } from "./package-manager/install.ts";
import { configurationStrategyName, hasCompatibleConfiguration } from "./package-manager/schema.ts";
import type { PackageName } from "./package/schema.ts";
import { loadState, removeState, saveState, stateMutationLock } from "./state/store.ts";

export interface UnlinkInput {
  readonly consumerRoot: string;
  readonly packageNames: ReadonlyArray<PackageName> | "all";
}

export const listLinkedPackages = Effect.fn("Unlink.listLinkedPackages")(function* (
  consumerStart: string,
) {
  const consumerRoot = yield* findConsumerRoot(consumerStart);
  const state = yield* loadState(consumerRoot);
  if (state === undefined || state.links.length === 0) {
    return yield* new ConsumerHasNoLinksError({ consumerRoot });
  }

  return state.links.toSorted((left, right) => left.packageName.localeCompare(right.packageName));
});

export const unlinkPackages = Effect.fn("Unlink.unlinkPackages")(function* (input: UnlinkInput) {
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
      if (!hasCompatibleConfiguration(state.packageManager, detectedManager)) {
        return yield* new PackageManagerChangedError({
          consumerRoot,
          previous: configurationStrategyName(state.packageManager),
          detected: configurationStrategyName(detectedManager),
        });
      }

      const packageNames =
        input.packageNames === "all"
          ? state.links.map((link) => link.packageName)
          : input.packageNames;
      for (const packageName of packageNames) {
        if (!state.links.some((link) => link.packageName === packageName)) {
          return yield* new ConsumerNotLinkedError({
            consumerRoot,
            packageName,
          });
        }
      }

      const removed = state.links.filter((link) => packageNames.includes(link.packageName));
      const remaining = state.links.filter((link) => !packageNames.includes(link.packageName));
      const currentConfiguration = yield* readConsumerConfiguration(consumerRoot);
      const plan = yield* planConsumerConfiguration({
        consumerRoot,
        manager: detectedManager,
        current: currentConfiguration,
        baselines: state.baselines,
        links: remaining,
      });

      yield* applyConsumerConfiguration(currentConfiguration, plan);
      yield* installConsumerDependencies(consumerRoot, detectedManager);
      for (const link of removed) {
        yield* fs.remove(link.materializedRoot, { force: true, recursive: true }).pipe(
          Effect.catchTag("PlatformError", (cause) =>
            Effect.fail(
              new MaterializationWriteError({
                path: link.materializedRoot,
                cause,
              }),
            ),
          ),
        );
      }

      if (remaining.length > 0) {
        const remainingPackageNames = new Set(remaining.map((link) => link.packageName));
        yield* saveState(consumerRoot, {
          ...state,
          packageManager: detectedManager,
          baselines: state.baselines.filter(
            (baseline) =>
              baseline.kind !== "package-json-dependency" ||
              remainingPackageNames.has(baseline.packageName),
          ),
          links: remaining,
        });
      } else {
        yield* removeState(consumerRoot);
      }

      return removed;
    }),
  );
});
