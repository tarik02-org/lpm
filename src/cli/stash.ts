import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";
import pc from "picocolors";

import { stashConsumer } from "../registry-transition.ts";

export const stashCommand = Command.make("stash", {}, () =>
  Effect.gen(function* () {
    const result = yield* stashConsumer(".");
    for (const entry of result.packages) {
      yield* Console.log(
        `${pc.green("📦 stashed")} ${pc.bold(pc.cyan(entry.packageName))} ${pc.dim("→")} ${pc.magenta(entry.version)}`,
      );
    }
  }),
).pipe(Command.withDescription("switch linked packages to their exact registry versions"));
