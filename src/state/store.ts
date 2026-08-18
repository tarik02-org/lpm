import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schedule from "effect/Schedule";
import * as Stream from "effect/Stream";

import { LpmConfig } from "../config.ts";
import {
  StateDecodeError,
  StateLockBusyError,
  StateLockError,
  StateReadError,
  StateWatchError,
  StateWriteError,
} from "../error.ts";
import type { AbsolutePath } from "../package/schema.ts";
import { decodeConsumerStateJson, encodeConsumerStateJson, type ConsumerState } from "./schema.ts";

const getStateDirectory = Effect.fn("StateStore.getDirectory")(function* (
  consumerRoot: AbsolutePath,
) {
  const config = yield* LpmConfig;
  const path = yield* Path.Path;
  const directory = yield* config.getDirectory();
  return path.resolve(consumerRoot, directory);
});

const stateLinksAreUnique = (state: ConsumerState) => {
  const packageNames = new Set<string>();
  for (const link of state.links) {
    if (packageNames.has(link.packageName)) {
      return false;
    }
    packageNames.add(link.packageName);
  }
  return true;
};

export const loadState = Effect.fn("StateStore.load")(function* (consumerRoot: AbsolutePath) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const stateDirectory = yield* getStateDirectory(consumerRoot);
  const statePath = path.join(stateDirectory, ".state.json");
  const exists = yield* fs
    .exists(statePath)
    .pipe(
      Effect.catchTag("PlatformError", (cause) =>
        Effect.fail(new StateReadError({ path: statePath, cause })),
      ),
    );

  let state: ConsumerState | undefined;
  if (exists) {
    const text = yield* fs
      .readFileString(statePath)
      .pipe(
        Effect.catchTag("PlatformError", (cause) =>
          Effect.fail(new StateReadError({ path: statePath, cause })),
        ),
      );
    state = yield* decodeConsumerStateJson(text).pipe(
      Effect.catchTag("SchemaError", (cause) =>
        Effect.fail(new StateDecodeError({ path: statePath, cause })),
      ),
    );

    if (!stateLinksAreUnique(state)) {
      return yield* new StateDecodeError({
        path: statePath,
        cause: new Error("state contains duplicate package links"),
      });
    }
  }

  return state;
});

export const saveState = Effect.fn("StateStore.save")(function* (
  consumerRoot: AbsolutePath,
  state: ConsumerState,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const stateDirectory = yield* getStateDirectory(consumerRoot);
  const statePath = path.join(stateDirectory, ".state.json");
  const temporaryPath = path.join(stateDirectory, ".state.json.tmp");
  const text = yield* encodeConsumerStateJson(state).pipe(
    Effect.catchTag("SchemaError", (cause) =>
      Effect.fail(new StateWriteError({ path: statePath, cause })),
    ),
  );

  yield* fs
    .makeDirectory(stateDirectory, { recursive: true })
    .pipe(
      Effect.catchTag("PlatformError", (cause) =>
        Effect.fail(new StateWriteError({ path: statePath, cause })),
      ),
    );
  yield* fs
    .writeFileString(temporaryPath, `${text}\n`)
    .pipe(
      Effect.catchTag("PlatformError", (cause) =>
        Effect.fail(new StateWriteError({ path: statePath, cause })),
      ),
    );
  yield* fs
    .rename(temporaryPath, statePath)
    .pipe(
      Effect.catchTag("PlatformError", (cause) =>
        Effect.fail(new StateWriteError({ path: statePath, cause })),
      ),
    );
});

export const removeState = Effect.fn("StateStore.remove")(function* (consumerRoot: AbsolutePath) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const stateDirectory = yield* getStateDirectory(consumerRoot);
  const statePath = path.join(stateDirectory, ".state.json");
  yield* fs
    .remove(statePath, { force: true })
    .pipe(
      Effect.catchTag("PlatformError", (cause) =>
        Effect.fail(new StateWriteError({ path: statePath, cause })),
      ),
    );
});

export const watchStateChanges = Effect.fn("StateStore.watchChanges")(function* (
  consumerRoot: AbsolutePath,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const stateDirectory = yield* getStateDirectory(consumerRoot);
  const statePath = path.join(stateDirectory, ".state.json");

  return fs.watch(stateDirectory).pipe(
    Stream.filter((event) => path.basename(event.path) === ".state.json"),
    Stream.map(() => undefined),
    Stream.catchTag("PlatformError", (cause) =>
      Stream.fail(new StateWatchError({ path: statePath, cause })),
    ),
  );
});

const acquireStateMutationLock = Effect.fn("StateStore.acquireMutationLock")(function* (
  consumerRoot: AbsolutePath,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const stateDirectory = yield* getStateDirectory(consumerRoot);
  const lockPath = path.join(stateDirectory, ".mutation.lock");

  yield* fs
    .makeDirectory(stateDirectory, { recursive: true })
    .pipe(
      Effect.catchTag("PlatformError", (cause) =>
        Effect.fail(new StateLockError({ path: lockPath, cause })),
      ),
    );
  yield* fs.makeDirectory(lockPath).pipe(
    Effect.catchTag(
      "PlatformError",
      (cause): Effect.Effect<never, StateLockBusyError | StateLockError> => {
        const { _tag: reason } = cause.reason;
        return reason === "AlreadyExists"
          ? Effect.fail(new StateLockBusyError({ path: lockPath, cause }))
          : Effect.fail(new StateLockError({ path: lockPath, cause }));
      },
    ),
  );

  return lockPath;
});

export const stateMutationLock = Effect.fn("StateStore.mutationLock")(
  (consumerRoot: AbsolutePath) =>
    Effect.acquireRelease(
      acquireStateMutationLock(consumerRoot).pipe(
        Effect.retry({
          schedule: Schedule.spaced("50 millis").pipe(Schedule.upTo({ times: 6_000 })),
          while: (error) => {
            const { _tag: tag } = error;
            return tag === "StateLockBusyError";
          },
        }),
      ),
      (lockPath) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.remove(lockPath, { force: true, recursive: true }).pipe(Effect.ignore);
        }),
    ),
);
