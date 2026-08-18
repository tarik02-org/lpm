import * as Effect from "effect/Effect";

import { findConsumerRoot } from "./consumer/root.ts";
import { PackageManagerChangedError } from "./error.ts";
import { materializePackage } from "./materialization/materialize.ts";
import {
  applyConsumerConfiguration,
  consumerConfigurationNeedsApply,
  planConsumerConfiguration,
  readConsumerConfiguration,
} from "./package-manager/config.ts";
import { detectPackageManager } from "./package-manager/detect.ts";
import { installConsumerDependencies } from "./package-manager/install.ts";
import { configurationStrategyName, hasCompatibleConfiguration } from "./package-manager/schema.ts";
import type { AbsolutePath, PackageName } from "./package/schema.ts";
import { readCurrentConsumerStatus, type CurrentConsumerStatus } from "./status.ts";
import { loadState, saveState, stateMutationLock } from "./state/store.ts";
import type { ConsumerState } from "./state/schema.ts";

export type DoctorIssue =
  | {
      readonly kind: "package-manager-changed";
      readonly previous: string;
      readonly detected: string;
    }
  | {
      readonly kind: "source-missing";
      readonly packageName: PackageName;
      readonly packageRoot: AbsolutePath;
    }
  | {
      readonly kind: "materialization-missing";
      readonly packageName: PackageName;
      readonly materializedRoot: AbsolutePath;
    }
  | {
      readonly kind: "configuration-drift";
      readonly consumerRoot: AbsolutePath;
    };

export interface DoctorReport {
  readonly status: CurrentConsumerStatus;
  readonly issues: ReadonlyArray<DoctorIssue>;
}

export interface DoctorRepairResult {
  readonly packageNames: ReadonlyArray<PackageName>;
}

export const diagnoseConsumer = Effect.fn("Doctor.diagnose")(function* (consumerStart: string) {
  const status = yield* readCurrentConsumerStatus(consumerStart);
  if (status.tracking.kind === "untracked") {
    return { status, issues: [] } satisfies DoctorReport;
  }

  const issues: Array<DoctorIssue> = [];
  if (!status.tracking.packageManagerCompatible) {
    issues.push({
      kind: "package-manager-changed",
      previous: configurationStrategyName(status.tracking.status.state.packageManager),
      detected: configurationStrategyName(status.detectedManager),
    });
  }

  for (const linkStatus of status.tracking.status.links) {
    if (!linkStatus.packageRootExists) {
      issues.push({
        kind: "source-missing",
        packageName: linkStatus.link.packageName,
        packageRoot: linkStatus.link.packageRoot,
      });
    }
    if (!linkStatus.materializedRootExists) {
      issues.push({
        kind: "materialization-missing",
        packageName: linkStatus.link.packageName,
        materializedRoot: linkStatus.link.materializedRoot,
      });
    }
  }

  if (status.tracking.packageManagerCompatible) {
    const current = yield* readConsumerConfiguration(status.consumerRoot);
    const plan = yield* planConsumerConfiguration({
      consumerRoot: status.consumerRoot,
      manager: status.detectedManager,
      current,
      baselines: status.tracking.status.state.baselines,
      links: status.tracking.status.state.links,
    });
    if (consumerConfigurationNeedsApply(current, plan)) {
      issues.push({ kind: "configuration-drift", consumerRoot: status.consumerRoot });
    }
  }

  return { status, issues } satisfies DoctorReport;
});

export const repairConsumer = Effect.fn("Doctor.repair")(function* (consumerStart: string) {
  const consumerRoot = yield* findConsumerRoot(consumerStart);
  const detectedManager = yield* detectPackageManager(consumerRoot);

  return yield* Effect.scoped(
    Effect.gen(function* () {
      yield* stateMutationLock(consumerRoot);
      const state = yield* loadState(consumerRoot);
      if (state === undefined) {
        return { packageNames: [] } satisfies DoctorRepairResult;
      }
      if (!hasCompatibleConfiguration(state.packageManager, detectedManager)) {
        return yield* new PackageManagerChangedError({
          consumerRoot,
          previous: configurationStrategyName(state.packageManager),
          detected: configurationStrategyName(detectedManager),
        });
      }

      for (const link of state.links) {
        yield* materializePackage({
          sourceRoot: link.packageRoot,
          destinationRoot: link.materializedRoot,
          manifestMode: link.manifestMode,
          manager: detectedManager,
        });
      }

      const current = yield* readConsumerConfiguration(consumerRoot);
      const plan = yield* planConsumerConfiguration({
        consumerRoot,
        manager: detectedManager,
        current,
        baselines: state.baselines,
        links: state.links,
      });
      const repairedState: ConsumerState = {
        ...state,
        packageManager: detectedManager,
        baselines: [...state.baselines, ...plan.baselineCaptures],
      };
      yield* saveState(consumerRoot, repairedState);
      yield* applyConsumerConfiguration(current, plan);
      yield* installConsumerDependencies(consumerRoot, detectedManager);

      return {
        packageNames: state.links.map((link) => link.packageName),
      } satisfies DoctorRepairResult;
    }),
  );
});
