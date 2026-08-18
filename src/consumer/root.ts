import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { parse, type ParseError } from "jsonc-parser";

import { ConsumerConfigurationReadError, ConsumerRootNotFoundError } from "../error.ts";
import { decodeAbsolutePath } from "../package/schema.ts";

const JsonObject = Schema.Record(Schema.String, Schema.Json);
const decodeJsonObject = Schema.decodeUnknownEffect(JsonObject);

const packageJsonHasWorkspaces = Effect.fn("ConsumerRoot.packageJsonHasWorkspaces")(function* (
  packageJsonPath: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs.readFileString(packageJsonPath).pipe(
    Effect.catchTag("PlatformError", (cause) =>
      Effect.fail(
        new ConsumerConfigurationReadError({
          path: packageJsonPath,
          cause,
        }),
      ),
    ),
  );
  const errors: Array<ParseError> = [];
  const input: unknown = parse(text, errors, { allowTrailingComma: false });
  if (errors.length > 0) {
    return yield* new ConsumerConfigurationReadError({
      path: packageJsonPath,
      cause: new Error("package.json contains invalid JSON"),
    });
  }
  const root = yield* decodeJsonObject(input).pipe(
    Effect.catchTag("SchemaError", (cause) =>
      Effect.fail(
        new ConsumerConfigurationReadError({
          path: packageJsonPath,
          cause,
        }),
      ),
    ),
  );
  return Object.hasOwn(root, "workspaces");
});

export const findConsumerRoot = Effect.fn("ConsumerRoot.find")(function* (startPath: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const canonicalStart = yield* fs.realPath(startPath).pipe(
    Effect.catchTag(
      "PlatformError",
      (cause): Effect.Effect<never, ConsumerConfigurationReadError | ConsumerRootNotFoundError> => {
        const { _tag: reason } = cause.reason;
        if (reason === "NotFound") {
          return Effect.fail(new ConsumerRootNotFoundError({ startPath }));
        }
        return Effect.fail(
          new ConsumerConfigurationReadError({
            path: startPath,
            cause,
          }),
        );
      },
    ),
  );
  let current = canonicalStart;
  let nearestPackageRoot: string | undefined;

  while (true) {
    const packageJsonPath = path.join(current, "package.json");
    const hasPackageJson = yield* fs.exists(packageJsonPath).pipe(
      Effect.catchTag("PlatformError", (cause) =>
        Effect.fail(
          new ConsumerConfigurationReadError({
            path: packageJsonPath,
            cause,
          }),
        ),
      ),
    );

    if (hasPackageJson) {
      nearestPackageRoot ??= current;
      const hasWorkspaceFile = yield* Effect.all([
        fs.exists(path.join(current, "pnpm-workspace.yaml")),
        fs.exists(path.join(current, "aube-workspace.yaml")),
      ]).pipe(
        Effect.catchTag("PlatformError", (cause) =>
          Effect.fail(
            new ConsumerConfigurationReadError({
              path: current,
              cause,
            }),
          ),
        ),
        Effect.map(([hasPnpmWorkspace, hasAubeWorkspace]) => hasPnpmWorkspace || hasAubeWorkspace),
      );
      const hasPackageWorkspaces = yield* packageJsonHasWorkspaces(packageJsonPath);
      if (hasWorkspaceFile || hasPackageWorkspaces) {
        return yield* decodeAbsolutePath(current).pipe(
          Effect.catchTag("SchemaError", () =>
            Effect.fail(new ConsumerRootNotFoundError({ startPath })),
          ),
        );
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  if (nearestPackageRoot === undefined) {
    return yield* new ConsumerRootNotFoundError({ startPath });
  }
  return yield* decodeAbsolutePath(nearestPackageRoot).pipe(
    Effect.catchTag("SchemaError", () => Effect.fail(new ConsumerRootNotFoundError({ startPath }))),
  );
});
