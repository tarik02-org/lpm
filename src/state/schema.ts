import * as Schema from "effect/Schema";

import { DetectedPackageManager } from "../package-manager/schema.ts";
import { AbsolutePath, PackageName, PackageVersion } from "../package/schema.ts";

export const ManifestMode = Schema.Literals(["normalized", "verbatim"]);
export type ManifestMode = typeof ManifestMode.Type;

const MissingValue = Schema.Struct({ kind: Schema.Literal("missing") });
const PreviousString = Schema.Union([
  MissingValue,
  Schema.Struct({ kind: Schema.Literal("present"), value: Schema.String }),
]);
const PreviousStringArray = Schema.Union([
  MissingValue,
  Schema.Struct({ kind: Schema.Literal("present"), value: Schema.Array(Schema.String) }),
]);
const StringRecord = Schema.Record(Schema.String, Schema.String);
const JsonRecord = Schema.Record(Schema.String, Schema.Json);
const PreviousJsonRecord = Schema.Union([
  MissingValue,
  Schema.Struct({ kind: Schema.Literal("present"), value: JsonRecord }),
]);
const PreviousStringRecord = Schema.Union([
  MissingValue,
  Schema.Struct({ kind: Schema.Literal("present"), value: StringRecord }),
]);

export const ManagedFieldBaseline = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("package-json-workspaces"),
    previous: PreviousStringArray,
  }),
  Schema.Struct({
    kind: Schema.Literal("package-json-overrides"),
    previous: PreviousJsonRecord,
  }),
  Schema.Struct({
    kind: Schema.Literal("package-json-resolutions"),
    previous: PreviousStringRecord,
  }),
  Schema.Struct({
    kind: Schema.Literal("package-json-dependency"),
    packageName: PackageName,
    section: Schema.Literals(["dependencies", "devDependencies", "optionalDependencies"]),
    previous: PreviousString,
  }),
  Schema.Struct({
    kind: Schema.Literal("pnpm-workspace-packages"),
    fileExisted: Schema.Boolean,
    previous: PreviousStringArray,
  }),
  Schema.Struct({
    kind: Schema.Literal("pnpm-workspace-overrides"),
    previous: PreviousStringRecord,
  }),
]);
export type ManagedFieldBaseline = typeof ManagedFieldBaseline.Type;

export const LinkRecord = Schema.Struct({
  packageName: PackageName,
  packageRoot: AbsolutePath,
  materializedRoot: AbsolutePath,
  manifestMode: ManifestMode,
});
export type LinkRecord = typeof LinkRecord.Type;

export const ConsumerMode = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("active") }),
  Schema.Struct({
    kind: Schema.Literal("stashed"),
    versions: Schema.Record(PackageName, PackageVersion),
  }),
]);
export type ConsumerMode = typeof ConsumerMode.Type;

export const ConsumerState = Schema.Struct({
  version: Schema.Literal(1),
  packageManager: DetectedPackageManager,
  baselines: Schema.Array(ManagedFieldBaseline),
  links: Schema.Array(LinkRecord),
  mode: ConsumerMode,
});
export type ConsumerState = typeof ConsumerState.Type;

export const ConsumerStateJson = Schema.fromJsonString(ConsumerState, { space: 2 });

export const decodeConsumerStateJson = Schema.decodeUnknownEffect(ConsumerStateJson);
export const encodeConsumerStateJson = Schema.encodeEffect(ConsumerStateJson);
