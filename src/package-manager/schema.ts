import * as Schema from "effect/Schema";

export const NpmPackageManager = Schema.Struct({
  kind: Schema.Literal("npm"),
  version: Schema.String,
});
export type NpmPackageManager = typeof NpmPackageManager.Type;

export const PnpmPackageManager = Schema.Struct({
  kind: Schema.Literal("pnpm"),
  version: Schema.String,
});
export type PnpmPackageManager = typeof PnpmPackageManager.Type;

export const YarnPackageManager = Schema.Struct({
  kind: Schema.Literal("yarn"),
  generation: Schema.Literals(["classic", "modern"]),
  version: Schema.String,
});
export type YarnPackageManager = typeof YarnPackageManager.Type;

export const BunPackageManager = Schema.Struct({
  kind: Schema.Literal("bun"),
  version: Schema.String,
});
export type BunPackageManager = typeof BunPackageManager.Type;

export const AubePackageManager = Schema.Struct({
  kind: Schema.Literal("aube"),
  version: Schema.String,
});
export type AubePackageManager = typeof AubePackageManager.Type;

export const DetectedPackageManager = Schema.Union([
  NpmPackageManager,
  PnpmPackageManager,
  YarnPackageManager,
  BunPackageManager,
  AubePackageManager,
]);
export type DetectedPackageManager = typeof DetectedPackageManager.Type;

export function hasCompatibleConfiguration(
  left: DetectedPackageManager,
  right: DetectedPackageManager,
) {
  if (left.kind !== right.kind) {
    return false;
  }
  if (left.kind === "yarn" && right.kind === "yarn") {
    return left.generation === right.generation;
  }
  return true;
}

export function configurationStrategyName(manager: DetectedPackageManager) {
  return manager.kind === "yarn" ? `yarn ${manager.generation}` : manager.kind;
}
