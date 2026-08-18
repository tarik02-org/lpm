import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import pc from "picocolors";

import { PackageRootRequiredError } from "../error.ts";
import { linkPackages } from "../link.ts";
import { resolveStashedMutationForce } from "./confirm.ts";

export const linkCommand = Command.make(
  "link",
  {
    packageRoots: Argument.string("package-root").pipe(Argument.variadic()),
    verbatim: Flag.boolean("verbatim").pipe(
      Flag.withDefault(false),
      Flag.withDescription("keep the materialized package.json unchanged"),
    ),
    force: Flag.boolean("force").pipe(
      Flag.withDefault(false),
      Flag.withDescription("discard a stash before linking packages"),
    ),
  },
  ({ force, packageRoots, verbatim }) =>
    Effect.gen(function* () {
      if (packageRoots.length === 0) {
        yield* new PackageRootRequiredError();
      }

      const discardStash = yield* resolveStashedMutationForce({
        consumerStart: ".",
        force,
      });

      const links = yield* linkPackages({
        consumerRoot: ".",
        packageRoots,
        manifestMode: verbatim ? "verbatim" : "normalized",
        force: discardStash,
      });
      for (const link of links) {
        yield* Console.log(
          `${pc.green("🔗 linked")} ${pc.bold(pc.cyan(link.packageName))} ${pc.dim("•")} ${pc.dim(link.packageRoot)} ${pc.dim("→")} ${pc.dim(link.materializedRoot)}`,
        );
      }
    }),
).pipe(Command.withDescription("link package-root paths into this consumer"));
