import Arborist from "@npmcli/arborist";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import packlist from "npm-packlist";

import { MaterializationReadError, MaterializationWriteError, PacklistError } from "../error.ts";
import type { DetectedPackageManager } from "../package-manager/schema.ts";
import type { AbsolutePath } from "../package/schema.ts";
import type { ManifestMode } from "../state/schema.ts";
import { normalizeMaterializedManifest } from "./manifest.ts";

export interface MaterializeInput {
  readonly sourceRoot: AbsolutePath;
  readonly destinationRoot: AbsolutePath;
  readonly manifestMode: ManifestMode;
  readonly manager: DetectedPackageManager;
}

export interface MaterializeResult {
  readonly packageJsonChanged: boolean;
}

const listPublishableFiles = Effect.fn("Materialization.listPublishableFiles")(function* (
  packageRoot: AbsolutePath,
) {
  return yield* Effect.tryPromise({
    try: async () => {
      const tree = await new Arborist({ path: packageRoot }).loadActual();
      return await packlist(tree);
    },
    catch: (cause) => new PacklistError({ packageRoot, cause }),
  });
});

export const materializePackage = Effect.fn("Materialization.materialize")(function* (
  input: MaterializeInput,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const destinationManifestPath = path.join(input.destinationRoot, "package.json");
  const previousManifestExists = yield* fs.exists(destinationManifestPath).pipe(
    Effect.catchTag("PlatformError", (cause) =>
      Effect.fail(
        new MaterializationReadError({
          path: destinationManifestPath,
          cause,
        }),
      ),
    ),
  );
  const previousManifest = previousManifestExists
    ? yield* fs.readFileString(destinationManifestPath).pipe(
        Effect.catchTag("PlatformError", (cause) =>
          Effect.fail(
            new MaterializationReadError({
              path: destinationManifestPath,
              cause,
            }),
          ),
        ),
      )
    : undefined;
  const files = yield* listPublishableFiles(input.sourceRoot);

  yield* fs.remove(input.destinationRoot, { force: true, recursive: true }).pipe(
    Effect.catchTag("PlatformError", (cause) =>
      Effect.fail(
        new MaterializationWriteError({
          path: input.destinationRoot,
          cause,
        }),
      ),
    ),
  );
  yield* fs.makeDirectory(input.destinationRoot, { recursive: true }).pipe(
    Effect.catchTag("PlatformError", (cause) =>
      Effect.fail(
        new MaterializationWriteError({
          path: input.destinationRoot,
          cause,
        }),
      ),
    ),
  );

  for (const file of files) {
    const sourcePath = path.join(input.sourceRoot, file);
    const destinationPath = path.join(input.destinationRoot, file);
    yield* fs.makeDirectory(path.dirname(destinationPath), { recursive: true }).pipe(
      Effect.catchTag("PlatformError", (cause) =>
        Effect.fail(
          new MaterializationWriteError({
            path: destinationPath,
            cause,
          }),
        ),
      ),
    );
    yield* fs.copyFile(sourcePath, destinationPath).pipe(
      Effect.catchTag("PlatformError", (cause) =>
        Effect.fail(
          new MaterializationWriteError({
            path: destinationPath,
            cause,
          }),
        ),
      ),
    );
  }

  let manifest = yield* fs.readFileString(destinationManifestPath).pipe(
    Effect.catchTag("PlatformError", (cause) =>
      Effect.fail(
        new MaterializationReadError({
          path: destinationManifestPath,
          cause,
        }),
      ),
    ),
  );
  if (input.manifestMode === "normalized") {
    manifest = yield* normalizeMaterializedManifest({
      path: destinationManifestPath,
      text: manifest,
      manager: input.manager,
    });
    yield* fs.writeFileString(destinationManifestPath, manifest).pipe(
      Effect.catchTag("PlatformError", (cause) =>
        Effect.fail(
          new MaterializationWriteError({
            path: destinationManifestPath,
            cause,
          }),
        ),
      ),
    );
  }

  return {
    packageJsonChanged: previousManifest !== manifest,
  } satisfies MaterializeResult;
});
