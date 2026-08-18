import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";
import pc from "picocolors";

import { unstashConsumer } from "../registry-transition.ts";

export const unstashCommand = Command.make("unstash", {}, () =>
  Effect.gen(function* () {
    const result = yield* unstashConsumer(".");
    for (const entry of result.packages) {
      yield* Console.log(`${pc.green("🔗 restored")} ${pc.bold(pc.cyan(entry.packageName))}`);
    }
  }),
).pipe(Command.withDescription("restore stashed packages to local links"));
