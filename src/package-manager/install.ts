import * as Effect from "effect/Effect";
import { ChildProcess } from "effect/unstable/process";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";

import { PackageManagerInstallError } from "../error.ts";
import type { AbsolutePath } from "../package/schema.ts";
import type { DetectedPackageManager } from "./schema.ts";

export const installConsumerDependencies = Effect.fn("PackageManager.installConsumerDependencies")(
  function* (consumerRoot: AbsolutePath, manager: DetectedPackageManager) {
    const processSpawner = yield* ChildProcessSpawner;
    const exitCode = yield* processSpawner
      .exitCode(
        ChildProcess.make(manager.kind, ["install"], {
          cwd: consumerRoot,
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
        }),
      )
      .pipe(
        Effect.catchTag("PlatformError", (cause) =>
          Effect.fail(
            new PackageManagerInstallError({
              consumerRoot,
              packageManager: manager.kind,
              cause,
            }),
          ),
        ),
      );

    if (exitCode !== 0) {
      yield* new PackageManagerInstallError({
        consumerRoot,
        packageManager: manager.kind,
        cause: new Error(`process exited with code ${exitCode}`),
      });
    }
    return;
  },
);
