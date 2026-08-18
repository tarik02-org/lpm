import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { parse, type ParseError } from "jsonc-parser";
import { ChildProcess } from "effect/unstable/process";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";

import {
  AmbiguousPackageManagerError,
  ConsumerConfigurationReadError,
  PackageManagerNotFoundError,
  UnsupportedPackageManagerError,
} from "../error.ts";
import type { AbsolutePath } from "../package/schema.ts";
import type { DetectedPackageManager } from "./schema.ts";

type PackageManagerKind = DetectedPackageManager["kind"];

const PackageManagerField = Schema.Struct({
  packageManager: Schema.optionalKey(Schema.String),
});
const decodePackageManagerField = Schema.decodeUnknownEffect(PackageManagerField);

const fromKindAndVersion = (
  kind: PackageManagerKind,
  version: string,
): Effect.Effect<DetectedPackageManager, UnsupportedPackageManagerError> => {
  if (kind === "yarn") {
    const majorText = version.match(/^\d+/)?.[0];
    if (majorText === undefined) {
      return new UnsupportedPackageManagerError({ packageManager: `yarn@${version}` });
    }
    return Effect.succeed({
      kind,
      generation: Number(majorText) === 1 ? "classic" : "modern",
      version,
    });
  }
  return Effect.succeed({ kind, version });
};

const parsePackageManagerField = (
  field: string,
): Effect.Effect<DetectedPackageManager, UnsupportedPackageManagerError> => {
  const match = field.match(/^(npm|pnpm|yarn|bun|aube)@(.+)$/);
  if (match === null) {
    return new UnsupportedPackageManagerError({ packageManager: field });
  }
  const kind = match[1];
  const version = match[2];
  if (kind === undefined || version === undefined) {
    return new UnsupportedPackageManagerError({ packageManager: field });
  }
  switch (kind) {
    case "npm":
    case "pnpm":
    case "yarn":
    case "bun":
    case "aube":
      return fromKindAndVersion(kind, version);
    default:
      return new UnsupportedPackageManagerError({ packageManager: field });
  }
};

const readExplicitPackageManager = Effect.fn("PackageManager.readExplicit")(function* (
  consumerRoot: AbsolutePath,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const packageJsonPath = path.join(consumerRoot, "package.json");
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
  const manifest = yield* decodePackageManagerField(input).pipe(
    Effect.catchTag("SchemaError", (cause) =>
      Effect.fail(
        new ConsumerConfigurationReadError({
          path: packageJsonPath,
          cause,
        }),
      ),
    ),
  );
  return manifest.packageManager;
});

const detectLockfileCandidates = Effect.fn("PackageManager.detectLockfiles")(function* (
  consumerRoot: AbsolutePath,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const groups: ReadonlyArray<{
    readonly kind: PackageManagerKind;
    readonly lockfiles: ReadonlyArray<string>;
  }> = [
    { kind: "aube", lockfiles: ["aube-lock.yaml"] },
    { kind: "pnpm", lockfiles: ["pnpm-lock.yaml"] },
    { kind: "bun", lockfiles: ["bun.lock", "bun.lockb"] },
    { kind: "yarn", lockfiles: ["yarn.lock"] },
    { kind: "npm", lockfiles: ["package-lock.json", "npm-shrinkwrap.json"] },
  ];
  const candidates: Array<PackageManagerKind> = [];

  for (const group of groups) {
    const existence = yield* Effect.all(
      group.lockfiles.map((lockfile) => fs.exists(path.join(consumerRoot, lockfile))),
    ).pipe(
      Effect.catchTag("PlatformError", (cause) =>
        Effect.fail(
          new ConsumerConfigurationReadError({
            path: consumerRoot,
            cause,
          }),
        ),
      ),
    );
    if (existence.some((exists) => exists)) {
      candidates.push(group.kind);
    }
  }

  return candidates;
});

const readInstalledVersion = Effect.fn("PackageManager.readVersion")(function* (
  consumerRoot: AbsolutePath,
  kind: PackageManagerKind,
) {
  const processSpawner = yield* ChildProcessSpawner;
  const output = yield* processSpawner
    .string(
      ChildProcess.make(kind, ["--version"], {
        cwd: consumerRoot,
        stderr: "ignore",
      }),
    )
    .pipe(
      Effect.catchTag("PlatformError", (cause) =>
        Effect.fail(
          new PackageManagerNotFoundError({
            consumerRoot,
            cause,
          }),
        ),
      ),
    );
  const version = output.trim();
  if (version.length === 0) {
    return yield* new PackageManagerNotFoundError({ consumerRoot });
  }
  return version;
});

export const detectPackageManager = Effect.fn("PackageManager.detect")(function* (
  consumerRoot: AbsolutePath,
) {
  const explicit = yield* readExplicitPackageManager(consumerRoot);
  if (explicit !== undefined) {
    return yield* parsePackageManagerField(explicit);
  }

  const candidates = yield* detectLockfileCandidates(consumerRoot);
  if (candidates.length === 0) {
    return yield* new PackageManagerNotFoundError({ consumerRoot });
  }
  if (candidates.length > 1) {
    return yield* new AmbiguousPackageManagerError({
      consumerRoot,
      candidates,
    });
  }

  const kind = candidates[0];
  if (kind === undefined) {
    return yield* new PackageManagerNotFoundError({ consumerRoot });
  }
  const version = yield* readInstalledVersion(consumerRoot, kind);
  return yield* fromKindAndVersion(kind, version);
});
