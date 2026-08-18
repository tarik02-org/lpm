import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import { Command, Flag } from "effect/unstable/cli";
import pc from "picocolors";

import { diagnoseConsumer, repairConsumer, type DoctorIssue } from "../doctor.ts";
import { DoctorIssuesFoundError } from "../error.ts";

const issueMessage = (issue: DoctorIssue) => {
  switch (issue.kind) {
    case "package-manager-changed":
      return `package manager strategy changed from ${issue.previous} to ${issue.detected}`;
    case "source-missing":
      return `source missing for ${issue.packageName} at ${issue.packageRoot}`;
    case "materialization-missing":
      return `materialization missing for ${issue.packageName} at ${issue.materializedRoot}`;
    case "configuration-drift":
      return `managed package-manager configuration drifted in ${issue.consumerRoot}`;
    default:
      return issue satisfies never;
  }
};

const issueNeedsUserRepair = (issue: DoctorIssue) =>
  issue.kind === "package-manager-changed" || issue.kind === "source-missing";

const printIssues = Effect.fn("DoctorCommand.printIssues")(function* (
  issues: ReadonlyArray<DoctorIssue>,
) {
  for (const issue of issues) {
    yield* Console.log(`${pc.red("✖")} ${pc.red(issueMessage(issue))}`);
  }
});

export const doctorCommand = Command.make(
  "doctor",
  {
    fix: Flag.boolean("fix").pipe(
      Flag.withDefault(false),
      Flag.withDescription("rebuild materializations and managed package-manager configuration"),
    ),
  },
  ({ fix }) =>
    Effect.gen(function* () {
      const report = yield* diagnoseConsumer(".");
      yield* Console.log(`${pc.cyan("🩺 doctor")} ${pc.bold(report.status.consumerRoot)}`);
      if (report.status.tracking.kind === "untracked") {
        yield* Console.log(`${pc.green("✓ healthy")} ${pc.dim("no LPM-managed links")}`);
        return;
      }

      if (!fix) {
        if (report.issues.length === 0) {
          yield* Console.log(`${pc.green("✓ healthy")} ${pc.dim("no issues found")}`);
          return;
        }
        yield* printIssues(report.issues);
        yield* new DoctorIssuesFoundError({
          consumerRoot: report.status.consumerRoot,
          issueCount: report.issues.length,
        });
      }

      if (report.issues.some(issueNeedsUserRepair)) {
        yield* printIssues(report.issues);
        yield* Console.log(
          `${pc.yellow("🔒 repair stopped")} ${pc.dim("fix the missing source or package-manager change first")}`,
        );
        yield* new DoctorIssuesFoundError({
          consumerRoot: report.status.consumerRoot,
          issueCount: report.issues.length,
        });
      }

      const repaired = yield* repairConsumer(".");
      const packageCount = repaired.packageNames.length;
      yield* Console.log(
        `${pc.green("🔧 repaired")} ${packageCount} ${packageCount === 1 ? "package" : "packages"} ${pc.dim("• configuration reconciled")}`,
      );
      const after = yield* diagnoseConsumer(".");
      if (after.issues.length > 0) {
        yield* printIssues(after.issues);
        yield* new DoctorIssuesFoundError({
          consumerRoot: after.status.consumerRoot,
          issueCount: after.issues.length,
        });
      }
      yield* Console.log(`${pc.green("✓ healthy")} ${pc.dim("repair verified")}`);
    }),
).pipe(Command.withDescription("diagnose and repair the current consumer"));
