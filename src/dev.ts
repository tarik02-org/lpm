import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Result from "effect/Result";
import * as Stream from "effect/Stream";

import { findConsumerRoot } from "./consumer/root.ts";
import {
  ConsumerHasNoLinksError,
  ConsumerNotLinkedError,
  DevelopmentWatchError,
  PackageManagerChangedError,
} from "./error.ts";
import { materializePackage } from "./materialization/materialize.ts";
import { detectPackageManager } from "./package-manager/detect.ts";
import { installConsumerDependencies } from "./package-manager/install.ts";
import { configurationStrategyName, hasCompatibleConfiguration } from "./package-manager/schema.ts";
import type { PackageName } from "./package/schema.ts";
import type { ConsumerState, LinkRecord } from "./state/schema.ts";
import { loadState, stateMutationLock, watchStateChanges } from "./state/store.ts";

export interface DevInput {
  readonly consumerRoot: string;
  readonly packageNames: ReadonlyArray<PackageName> | "all";
}

export interface DevelopmentSync {
  readonly packageNames: ReadonlyArray<PackageName>;
  readonly packageJsonChanged: boolean;
}

interface DevelopmentSelection {
  readonly consumerRoot: string;
  readonly links: ReadonlyArray<LinkRecord>;
}

const selectDevelopmentPackages = (
  state: ConsumerState | undefined,
  consumerRoot: string,
  packageNames: ReadonlySet<PackageName> | "all",
) => {
  if (state === undefined) {
    return { consumerRoot, links: [] } satisfies DevelopmentSelection;
  }

  const links = state.links
    .filter((link) => packageNames === "all" || packageNames.has(link.packageName))
    .toSorted((left, right) => left.packageName.localeCompare(right.packageName));
  return { consumerRoot, links } satisfies DevelopmentSelection;
};

const developmentSelectionsAreEqual = (left: DevelopmentSelection, right: DevelopmentSelection) =>
  left.consumerRoot === right.consumerRoot &&
  left.links.length === right.links.length &&
  left.links.every((selected, index) => {
    const current = right.links[index];
    return (
      current !== undefined &&
      selected.packageName === current.packageName &&
      selected.packageRoot === current.packageRoot &&
      selected.materializedRoot === current.materializedRoot &&
      selected.manifestMode === current.manifestMode
    );
  });

export const devPackages = (input: DevInput) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const consumerRoot = yield* findConsumerRoot(input.consumerRoot);
      const detectedManager = yield* detectPackageManager(consumerRoot);
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

      const requestedPackageNames =
        input.packageNames === "all" ? "all" : new Set(input.packageNames);
      const initialPackageNames =
        requestedPackageNames === "all"
          ? new Set(state.links.map((link) => link.packageName))
          : requestedPackageNames;
      for (const packageName of initialPackageNames) {
        if (!state.links.some((link) => link.packageName === packageName)) {
          return yield* new ConsumerNotLinkedError({ consumerRoot, packageName });
        }
      }

      const stateChanges = yield* watchStateChanges(consumerRoot);
      const selections = Stream.merge(
        stateChanges.pipe(Stream.mapEffect(() => loadState(consumerRoot))),
        Stream.fromEffect(loadState(consumerRoot)),
      ).pipe(
        Stream.map((currentState) =>
          selectDevelopmentPackages(currentState, consumerRoot, requestedPackageNames),
        ),
        Stream.changesWith(developmentSelectionsAreEqual),
      );

      return selections.pipe(
        Stream.switchMap((selection) => {
          if (selection.links.length === 0) {
            return Stream.never;
          }

          const watches = selection.links.map((link) =>
            fs.watch(link.packageRoot, { recursive: true }).pipe(
              Stream.filter((event) =>
                event.path
                  .split(/[\\/]/)
                  .every((segment) => segment !== ".git" && segment !== "node_modules"),
              ),
              Stream.map(() => selection),
              Stream.catchTag("PlatformError", (cause) =>
                Stream.fail(
                  new DevelopmentWatchError({
                    packageName: link.packageName,
                    packageRoot: link.packageRoot,
                    cause,
                  }),
                ),
              ),
            ),
          );
          const changes: Array<Stream.Stream<DevelopmentSelection, DevelopmentWatchError>> = [
            ...watches,
            Stream.make(selection),
          ];

          return Stream.mergeAll(changes, { concurrency: "unbounded" }).pipe(
            Stream.debounce("100 millis"),
          );
        }),
        Stream.filterMapEffect((selection) =>
          Effect.scoped(
            Effect.gen(function* () {
              yield* stateMutationLock(consumerRoot);
              const currentState = yield* loadState(consumerRoot);
              const currentSelection = selectDevelopmentPackages(
                currentState,
                consumerRoot,
                requestedPackageNames,
              );
              if (!developmentSelectionsAreEqual(selection, currentSelection)) {
                return Result.failVoid;
              }

              let packageJsonChanged = false;
              for (const link of selection.links) {
                const result = yield* materializePackage({
                  sourceRoot: link.packageRoot,
                  destinationRoot: link.materializedRoot,
                  manifestMode: link.manifestMode,
                  manager: detectedManager,
                });
                packageJsonChanged ||= result.packageJsonChanged;
              }
              if (packageJsonChanged) {
                yield* installConsumerDependencies(consumerRoot, detectedManager);
              }
              return Result.succeed({
                packageNames: selection.links.map((link) => link.packageName),
                packageJsonChanged,
              } satisfies DevelopmentSync);
            }),
          ),
        ),
      );
    }),
  );
