import { Command } from "effect/unstable/cli";

import { devCommand } from "./dev.ts";
import { doctorCommand } from "./doctor.ts";
import { linkCommand } from "./link.ts";
import { statusCommand } from "./status.ts";
import { unlinkCommand } from "./unlink.ts";

export function createCliCommand() {
  return Command.make("lpm").pipe(
    Command.withDescription("link local package roots into consumer projects"),
    Command.withSubcommands([linkCommand, unlinkCommand, devCommand, statusCommand, doctorCommand]),
  );
}
