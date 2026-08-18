import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import { Command, Flag } from "effect/unstable/cli";
import pc from "picocolors";

import { commitConsumer } from "../registry-transition.ts";
import { resolveStashedMutationForce } from "./confirm.ts";

export const commitCommand = Command.make(
  "commit",
  {
    force: Flag.boolean("force").pipe(
      Flag.withDefault(false),
      Flag.withDescription("discard a stash before committing dependency versions"),
    ),
  },
  ({ force }) =>
    Effect.gen(function* () {
      const discardStash = yield* resolveStashedMutationForce({
        consumerStart: ".",
        force,
      });
      const result = yield* commitConsumer({ consumerRoot: ".", force: discardStash });
      for (const entry of result.packages) {
        yield* Console.log(
          `${pc.green("✓ committed")} ${pc.bold(pc.cyan(entry.packageName))} ${pc.dim("→")} ${pc.magenta(entry.version)}`,
        );
      }
    }),
).pipe(Command.withDescription("replace all links with registry dependency versions"));
