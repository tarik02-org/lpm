import * as Schema from "effect/Schema";
import { valid } from "semver";

export const PackageName = Schema.String.check(
  Schema.isPattern(/^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/),
).pipe(Schema.brand("lpm/PackageName"));
export type PackageName = typeof PackageName.Type;

export const AbsolutePath = Schema.String.check(Schema.isPattern(/^(?:\/|[A-Za-z]:[\\/])/)).pipe(
  Schema.brand("lpm/AbsolutePath"),
);
export type AbsolutePath = typeof AbsolutePath.Type;

export const PackageVersion = Schema.String.check(
  Schema.makeFilter((version) =>
    valid(version) === version ? undefined : "expected an exact semantic version",
  ),
).pipe(Schema.brand("lpm/PackageVersion"));
export type PackageVersion = typeof PackageVersion.Type;

export const PackageManifest = Schema.Struct({
  name: PackageName,
  version: PackageVersion,
});
export type PackageManifest = typeof PackageManifest.Type;

export const decodePackageName = Schema.decodeUnknownEffect(PackageName);
export const decodeAbsolutePath = Schema.decodeUnknownEffect(AbsolutePath);
export const decodePackageVersion = Schema.decodeUnknownEffect(PackageVersion);
export const decodePackageManifest = Schema.decodeUnknownEffect(PackageManifest);
