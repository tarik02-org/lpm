import { confirm, isCancel } from "@clack/prompts";
import * as Effect from "effect/Effect";
import * as Stdio from "effect/Stdio";

import {
  InteractivePromptError,
  StashedMutationCancelledError,
  StashedMutationRequiresForceError,
} from "../error.ts";
import { readCurrentConsumerStatus } from "../status.ts";

const confirmAction = Effect.fn("Cli.confirmAction")(function* (message: string) {
  const answer = yield* Effect.tryPromise({
    try: (signal) => confirm({ message, initialValue: false, signal }),
    catch: (cause) => new InteractivePromptError({ cause }),
  });
  return !isCancel(answer) && answer;
});

export const resolveStashedMutationForce = Effect.fn("Cli.resolveStashedMutationForce")(
  function* (options: { readonly consumerStart: string; readonly force: boolean }) {
    if (options.force) {
      return true;
    }

    const status = yield* readCurrentConsumerStatus(options.consumerStart);
    if (
      status.tracking.kind === "untracked" ||
      status.tracking.status.state.mode.kind === "active"
    ) {
      return false;
    }

    const stdio = yield* Stdio.Stdio;
    const [stdinIsTerminal, stdoutIsTerminal] = yield* Effect.all([
      stdio.stdinIsTerminal,
      stdio.stdoutIsTerminal,
    ]);
    if (!stdinIsTerminal || !stdoutIsTerminal) {
      return yield* new StashedMutationRequiresForceError({
        consumerRoot: status.consumerRoot,
      });
    }

    const approved = yield* confirmAction("Discard the stash and continue?");
    if (!approved) {
      return yield* new StashedMutationCancelledError();
    }
    return true;
  },
);
