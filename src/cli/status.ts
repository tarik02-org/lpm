import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";
import pc from "picocolors";

import {
  configurationStrategyName,
  type DetectedPackageManager,
} from "../package-manager/schema.ts";
import { readCurrentConsumerStatus, type LinkStatus } from "../status.ts";

const healthIcon = (healthy: boolean) => (healthy ? pc.green("✓") : pc.red("✖"));

const packageManagerLabel = (manager: DetectedPackageManager) =>
  `${configurationStrategyName(manager)} ${manager.version}`;

const linkIsHealthy = (status: LinkStatus) =>
  status.packageRootExists && status.materializedRootExists;

const printLinkStatus = Effect.fn("StatusCommand.printLink")(function* (status: LinkStatus) {
  yield* Console.log(
    `  ${healthIcon(linkIsHealthy(status))} ${pc.bold(pc.cyan(status.link.packageName))}`,
  );
  yield* Console.log(
    `    ${healthIcon(status.packageRootExists)} ${pc.dim("source")} ${pc.dim(status.link.packageRoot)}`,
  );
  yield* Console.log(
    `    ${healthIcon(status.materializedRootExists)} ${pc.dim("materialized")} ${pc.dim(status.link.materializedRoot)}`,
  );
});

export const statusCommand = Command.make("status", {}, () =>
  Effect.gen(function* () {
    const status = yield* readCurrentConsumerStatus(".");
    yield* Console.log(`${pc.cyan("🏠 consumer")} ${pc.bold(status.consumerRoot)}`);
    yield* Console.log(
      `${pc.magenta("📦 detected")} ${pc.bold(packageManagerLabel(status.detectedManager))}`,
    );
    if (status.tracking.kind === "untracked") {
      yield* Console.log(`${pc.yellow("📭")} ${pc.dim("no linked packages")}`);
      return;
    }

    yield* Console.log(
      `${healthIcon(status.tracking.packageManagerCompatible)} ${pc.magenta("strategy")} ${pc.bold(configurationStrategyName(status.tracking.status.state.packageManager))} ${pc.dim(`• recorded ${status.tracking.status.state.packageManager.version}`)}`,
    );
    if (status.tracking.status.links.length === 0) {
      yield* Console.log(`${pc.yellow("📭")} ${pc.dim("no linked packages")}`);
      return;
    }
    yield* Console.log(pc.bold("Links"));
    for (const link of status.tracking.status.links) {
      yield* printLinkStatus(link);
    }
  }),
).pipe(Command.withDescription("show this consumer's link health"));
