#!/usr/bin/env node
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";
import pc from "picocolors";

import { createCliCommand } from "./cli/app.ts";
import { LpmConfigLive } from "./config.ts";

declare const LPM_VERSION: string;

Command.run(createCliCommand(), { version: LPM_VERSION }).pipe(
  Effect.scoped,
  Effect.provide(LpmConfigLive),
  Effect.provide(NodeServices.layer),
  Effect.tapError((error) => Console.error(`${pc.red("✖")} ${pc.red(error.message)}`)),
  NodeRuntime.runMain({ disableErrorReporting: true }),
);
