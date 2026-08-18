import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { LpmConfigDecodeError, LpmConfigLocationError, LpmConfigReadError } from "./error.ts";

export const DEFAULT_LPM_DIRECTORY = ".local/lpm";

const ConfiguredDirectory = Schema.String.check(Schema.isNonEmpty(), Schema.isPattern(/^[^\0]+$/));
const LpmConfigFile = Schema.Struct({
  directory: Schema.optionalKey(ConfiguredDirectory),
});
const LpmConfigFileJson = Schema.fromJsonString(LpmConfigFile);
const decodeLpmConfigFileJson = Schema.decodeUnknownEffect(LpmConfigFileJson);

export class LpmConfig extends Context.Service<
  LpmConfig,
  {
    readonly getDirectory: () => Effect.Effect<
      string,
      LpmConfigLocationError | LpmConfigReadError | LpmConfigDecodeError,
      FileSystem.FileSystem | Path.Path
    >;
  }
>()("lpm/LpmConfig") {}

const loadLpmDirectory = Effect.fn("LpmConfig.loadDirectory")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const xdgConfigHome = yield* Config.string("XDG_CONFIG_HOME").pipe(
    Config.option,
    Effect.catchTag("ConfigError", (cause) => Effect.fail(new LpmConfigLocationError({ cause }))),
  );

  let configHome: string;
  if (
    Option.isSome(xdgConfigHome) &&
    xdgConfigHome.value.length > 0 &&
    path.isAbsolute(xdgConfigHome.value)
  ) {
    configHome = xdgConfigHome.value;
  } else {
    const home = yield* Config.string("HOME").pipe(
      Effect.catchTag("ConfigError", (cause) => Effect.fail(new LpmConfigLocationError({ cause }))),
    );
    if (home.length === 0) {
      return yield* new LpmConfigLocationError({ cause: new Error("HOME is empty") });
    }
    configHome = path.join(home, ".config");
  }

  const filePath = path.join(configHome, "lpm", "config.json");
  const exists = yield* fs
    .exists(filePath)
    .pipe(
      Effect.catchTag("PlatformError", (cause) =>
        Effect.fail(new LpmConfigReadError({ path: filePath, cause })),
      ),
    );
  let configuredDirectory = DEFAULT_LPM_DIRECTORY;
  if (exists) {
    const text = yield* fs
      .readFileString(filePath)
      .pipe(
        Effect.catchTag("PlatformError", (cause) =>
          Effect.fail(new LpmConfigReadError({ path: filePath, cause })),
        ),
      );
    const file = yield* decodeLpmConfigFileJson(text).pipe(
      Effect.catchTag("SchemaError", (cause) =>
        Effect.fail(new LpmConfigDecodeError({ path: filePath, cause })),
      ),
    );
    configuredDirectory = file.directory ?? DEFAULT_LPM_DIRECTORY;
  }

  const directory = path.normalize(configuredDirectory);
  if (
    path.isAbsolute(configuredDirectory) ||
    directory === "." ||
    directory === ".." ||
    directory.startsWith(`..${path.sep}`)
  ) {
    return yield* new LpmConfigDecodeError({
      path: filePath,
      cause: new Error("directory must stay inside each consumer root"),
    });
  }

  return directory;
});

export const makeLpmConfig = Effect.fn("LpmConfig.make")(function* () {
  const directory = yield* Effect.cached(loadLpmDirectory());
  return { getDirectory: () => directory };
});

export const LpmConfigLive = Layer.effect(LpmConfig, makeLpmConfig());
