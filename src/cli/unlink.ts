import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import pc from "picocolors";

import { InvalidPackageNameError, InvalidUnlinkSelectionError } from "../error.ts";
import { decodePackageName } from "../package/schema.ts";
import type { PackageName } from "../package/schema.ts";
import { listLinkedPackages, unlinkPackages } from "../unlink.ts";
import { resolveStashedMutationForce } from "./confirm.ts";
import { selectMany } from "./multi-select.ts";

export const unlinkCommand = Command.make(
  "unlink",
  {
    packageNames: Argument.string("package").pipe(Argument.variadic()),
    all: Flag.boolean("all").pipe(
      Flag.withDefault(false),
      Flag.withDescription("unlink every package in this consumer"),
    ),
    force: Flag.boolean("force").pipe(
      Flag.withDefault(false),
      Flag.withDescription("discard a stash before unlinking packages"),
    ),
  },
  ({ all, force, packageNames }) =>
    Effect.gen(function* () {
      if (all && packageNames.length > 0) {
        yield* new InvalidUnlinkSelectionError({
          reason: "pass package names or --all, not both",
        });
      }

      let selectedPackageNames: ReadonlyArray<PackageName> | "all";
      if (all) {
        selectedPackageNames = "all";
      } else if (packageNames.length > 0) {
        selectedPackageNames = yield* Effect.all(
          packageNames.map((packageName) =>
            decodePackageName(packageName).pipe(
              Effect.catchTag("SchemaError", () =>
                Effect.fail(new InvalidPackageNameError({ packageName })),
              ),
            ),
          ),
        );
      } else {
        const links = yield* listLinkedPackages(".");
        selectedPackageNames = yield* selectMany({
          message: "Select packages to unlink",
          placeholder: "Search linked packages",
          options: links.map((link) => ({
            value: link.packageName,
            label: link.packageName,
            hint: link.packageRoot,
            disabled: false,
          })),
        });
        if (selectedPackageNames.length === 0) {
          yield* Console.log(`${pc.yellow("📭")} ${pc.dim("no packages selected")}`);
          return;
        }
      }

      const discardStash = yield* resolveStashedMutationForce({
        consumerStart: ".",
        force,
      });
      const removed = yield* unlinkPackages({
        consumerRoot: ".",
        packageNames: selectedPackageNames,
        force: discardStash,
      });
      for (const link of removed) {
        yield* Console.log(`${pc.green("➖ unlinked")} ${pc.bold(pc.cyan(link.packageName))}`);
      }
      return;
    }),
).pipe(Command.withDescription("unlink packages from this consumer"));
