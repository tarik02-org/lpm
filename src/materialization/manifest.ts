import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { applyEdits, modify, parse, type FormattingOptions, type ParseError } from "jsonc-parser";

import { ManifestNormalizationError } from "../error.ts";
import type { DetectedPackageManager } from "../package-manager/schema.ts";

type JsonValue = typeof Schema.Json.Type;

const JsonObject = Schema.Record(Schema.String, Schema.Json);
const OptionalStringRecord = Schema.UndefinedOr(Schema.Record(Schema.String, Schema.String));
const decodeJsonObject = Schema.decodeUnknownEffect(JsonObject);
const decodeOptionalStringRecord = Schema.decodeUnknownEffect(OptionalStringRecord);

const formattingOptions = (text: string): FormattingOptions => {
  const indentation = text.match(/\n([ \t]+)"/)?.[1] ?? "  ";
  return {
    insertSpaces: !indentation.includes("\t"),
    tabSize: indentation.includes("\t") ? 1 : indentation.length,
    eol: text.includes("\r\n") ? "\r\n" : "\n",
  };
};

const registrySpecifier = (specifier: string) => {
  if (!specifier.startsWith("workspace:")) {
    return specifier;
  }
  const range = specifier.slice("workspace:".length);
  if (range === "*" || range === "^" || range === "~" || range.length === 0) {
    return "*";
  }
  return range;
};

export const normalizeMaterializedManifest = Effect.fn("MaterializedManifest.normalize")(
  function* (options: {
    readonly path: string;
    readonly text: string;
    readonly manager: DetectedPackageManager;
  }) {
    const errors: Array<ParseError> = [];
    const input: unknown = parse(options.text, errors, { allowTrailingComma: false });
    if (errors.length > 0) {
      return yield* new ManifestNormalizationError({
        path: options.path,
        cause: new Error("package.json contains invalid JSON"),
      });
    }
    const root = yield* decodeJsonObject(input).pipe(
      Effect.catchTag("SchemaError", (cause) =>
        Effect.fail(
          new ManifestNormalizationError({
            path: options.path,
            cause,
          }),
        ),
      ),
    );

    const removals: ReadonlyArray<ReadonlyArray<string>> = [
      ["devDependencies"],
      ["workspaces"],
      ["packageManager"],
      ["private"],
    ];
    const edits: Array<{
      readonly path: ReadonlyArray<string>;
      readonly value: JsonValue | undefined;
    }> = removals.map((path) => ({ path, value: undefined }));

    const scripts = yield* decodeOptionalStringRecord(root.scripts).pipe(
      Effect.catchTag("SchemaError", (cause) =>
        Effect.fail(
          new ManifestNormalizationError({
            path: options.path,
            cause,
          }),
        ),
      ),
    );
    if (scripts !== undefined) {
      const normalizedScripts = { ...scripts };
      const workspaceLifecycleScripts: ReadonlyArray<string> = [
        "prepare",
        "prepublish",
        "prepublishOnly",
        "prepack",
        "postpack",
      ];
      for (const name of workspaceLifecycleScripts) {
        delete normalizedScripts[name];
      }
      if (Object.keys(normalizedScripts).length === 0) {
        edits.push({ path: ["scripts"], value: undefined });
      } else {
        edits.push({ path: ["scripts"], value: normalizedScripts });
      }
    }

    if (options.manager.kind === "npm" || options.manager.kind === "yarn") {
      const dependencySections: ReadonlyArray<
        "dependencies" | "optionalDependencies" | "peerDependencies"
      > = ["dependencies", "optionalDependencies", "peerDependencies"];
      for (const section of dependencySections) {
        const dependencies = yield* decodeOptionalStringRecord(root[section]).pipe(
          Effect.catchTag("SchemaError", (cause) =>
            Effect.fail(
              new ManifestNormalizationError({
                path: options.path,
                cause,
              }),
            ),
          ),
        );
        if (dependencies === undefined) {
          continue;
        }
        const normalizedDependencies = Object.fromEntries(
          Object.entries(dependencies).map(([name, specifier]) => [
            name,
            registrySpecifier(specifier),
          ]),
        );
        edits.push({ path: [section], value: normalizedDependencies });
      }
    }

    return yield* Effect.try({
      try: () => {
        let text = options.text;
        const format = formattingOptions(text);
        for (const edit of edits) {
          text = applyEdits(
            text,
            modify(text, [...edit.path], edit.value, { formattingOptions: format }),
          );
        }
        return text;
      },
      catch: (cause) =>
        new ManifestNormalizationError({
          path: options.path,
          cause,
        }),
    });
  },
);
