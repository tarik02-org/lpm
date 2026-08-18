import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { findConsumerRoot } from "./consumer/root.ts";
import { StatusPathReadError } from "./error.ts";
import { detectPackageManager } from "./package-manager/detect.ts";
import {
  hasCompatibleConfiguration,
  type DetectedPackageManager,
} from "./package-manager/schema.ts";
import type { AbsolutePath } from "./package/schema.ts";
import type { ConsumerState, LinkRecord } from "./state/schema.ts";
import { loadState } from "./state/store.ts";

export interface LinkStatus {
  readonly link: LinkRecord;
  readonly packageRootExists: boolean;
  readonly materializedRootExists: boolean;
}

export interface ConsumerStatus {
  readonly consumerRoot: AbsolutePath;
  readonly state: ConsumerState;
  readonly links: ReadonlyArray<LinkStatus>;
}

export interface TrackedCurrentConsumerStatus {
  readonly kind: "tracked";
  readonly status: ConsumerStatus;
  readonly packageManagerCompatible: boolean;
}

export interface UntrackedCurrentConsumerStatus {
  readonly kind: "untracked";
}

export type CurrentConsumerTrackingStatus =
  | TrackedCurrentConsumerStatus
  | UntrackedCurrentConsumerStatus;

export interface CurrentConsumerStatus {
  readonly consumerRoot: AbsolutePath;
  readonly detectedManager: DetectedPackageManager;
  readonly tracking: CurrentConsumerTrackingStatus;
}

const inspectPath = Effect.fn("Status.inspectPath")(function* (inspectedPath: AbsolutePath) {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs
    .exists(inspectedPath)
    .pipe(
      Effect.catchTag("PlatformError", (cause) =>
        Effect.fail(new StatusPathReadError({ path: inspectedPath, cause })),
      ),
    );
});

const inspectConsumer = Effect.fn("Status.inspectConsumer")(function* (
  consumerRoot: AbsolutePath,
  state: ConsumerState,
) {
  const links: Array<LinkStatus> = [];
  for (const link of state.links.toSorted((left, right) =>
    left.packageName.localeCompare(right.packageName),
  )) {
    links.push({
      link,
      packageRootExists: yield* inspectPath(link.packageRoot),
      materializedRootExists: yield* inspectPath(link.materializedRoot),
    });
  }
  return { consumerRoot, state, links } satisfies ConsumerStatus;
});

export const readCurrentConsumerStatus = Effect.fn("Status.readCurrentConsumer")(function* (
  consumerStart: string,
) {
  const consumerRoot = yield* findConsumerRoot(consumerStart);
  const detectedManager = yield* detectPackageManager(consumerRoot);
  const state = yield* loadState(consumerRoot);
  const tracking: CurrentConsumerTrackingStatus =
    state === undefined
      ? { kind: "untracked" }
      : {
          kind: "tracked",
          status: yield* inspectConsumer(consumerRoot, state),
          packageManagerCompatible: hasCompatibleConfiguration(
            state.packageManager,
            detectedManager,
          ),
        };

  return { consumerRoot, detectedManager, tracking } satisfies CurrentConsumerStatus;
});
