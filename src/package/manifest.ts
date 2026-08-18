import * as FileSystem from "effect/FileSystem";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import { parse, type ParseError } from "jsonc-parser";

import { InvalidPackageManifestError, PackageManifestReadError } from "../error.ts";
import { decodePackageManifest } from "./schema.ts";
import type { AbsolutePath } from "./schema.ts";

export const readPackageManifest = Effect.fn("PackageManifest.read")(function* (
  packageRoot: AbsolutePath,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const manifestPath = path.join(packageRoot, "package.json");
  const text = yield* fs.readFileString(manifestPath).pipe(
    Effect.catchTag("PlatformError", (cause) =>
      Effect.fail(
        new PackageManifestReadError({
          path: manifestPath,
          cause,
        }),
      ),
    ),
  );
  const parseErrors: Array<ParseError> = [];
  const input: unknown = parse(text, parseErrors, { allowTrailingComma: false });

  if (parseErrors.length > 0) {
    return yield* new InvalidPackageManifestError({
      path: manifestPath,
      cause: new Error("package.json contains invalid JSON"),
    });
  }

  return yield* decodePackageManifest(input).pipe(
    Effect.catchTag("SchemaError", (cause) =>
      Effect.fail(
        new InvalidPackageManifestError({
          path: manifestPath,
          cause,
        }),
      ),
    ),
  );
});
