import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { Argument, Command, Flag } from "effect/unstable/cli";
import pc from "picocolors";

import { devPackages } from "../dev.ts";
import { InvalidPackageNameError } from "../error.ts";
import { decodePackageName } from "../package/schema.ts";
import { resolveStashedMutationForce } from "./confirm.ts";

export const devCommand = Command.make(
  "dev",
  {
    packageNames: Argument.string("package").pipe(Argument.variadic()),
    force: Flag.boolean("force").pipe(
      Flag.withDefault(false),
      Flag.withDescription("discard a stash before watching packages"),
    ),
  },
  ({ force, packageNames }) =>
    Effect.gen(function* () {
      const decodedPackageNames = yield* Effect.all(
        packageNames.map((packageName) =>
          decodePackageName(packageName).pipe(
            Effect.catchTag("SchemaError", () =>
              Effect.fail(new InvalidPackageNameError({ packageName })),
            ),
          ),
        ),
      );
      const selection =
        decodedPackageNames.length === 0
          ? pc.cyan("all linked packages")
          : decodedPackageNames.map((packageName) => pc.bold(pc.cyan(packageName))).join(", ");
      yield* Console.log(`${pc.cyan("👀 dev mode")} ${pc.dim("•")} ${selection}`);
      const discardStash = yield* resolveStashedMutationForce({
        consumerStart: ".",
        force,
      });
      yield* devPackages({
        consumerRoot: ".",
        packageNames: decodedPackageNames.length === 0 ? "all" : decodedPackageNames,
        force: discardStash,
      }).pipe(
        Stream.runForEach((sync) => {
          const syncedPackageNames = sync.packageNames
            .map((packageName) => pc.bold(pc.cyan(packageName)))
            .join(", ");
          const reconciliation = sync.packageJsonChanged
            ? ` ${pc.dim("•")} ${pc.magenta("📦 dependencies reconciled")}`
            : "";
          return Console.log(`${pc.green("✨ synced")} ${syncedPackageNames}${reconciliation}`);
        }),
      );
    }),
).pipe(Command.withDescription("keep linked packages synchronized with their package roots"));
