import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { applyEdits, modify, parse, type FormattingOptions, type ParseError } from "jsonc-parser";
import { parseDocument } from "yaml";

import {
  ConsumerConfigurationReadError,
  ConsumerConfigurationWriteError,
  UnsupportedConsumerConfigurationError,
} from "../error.ts";
import type { AbsolutePath, PackageName, PackageVersion } from "../package/schema.ts";
import type { LinkRecord, ManagedFieldBaseline } from "../state/schema.ts";
import type { DetectedPackageManager } from "./schema.ts";

type JsonValue = typeof Schema.Json.Type;
type JsonRecord = Readonly<Record<string, JsonValue>>;
type StringRecord = Readonly<Record<string, string>>;
export type DependencySection = "dependencies" | "devDependencies" | "optionalDependencies";

type DesiredValue<A> =
  | { readonly kind: "missing" }
  | { readonly kind: "present"; readonly value: A };

export interface PackageJsonConfiguration {
  readonly path: string;
  readonly sourceText: string;
  readonly workspaces: ReadonlyArray<string> | undefined;
  readonly overrides: JsonRecord | undefined;
  readonly resolutions: StringRecord | undefined;
  readonly dependencies: StringRecord | undefined;
  readonly devDependencies: StringRecord | undefined;
  readonly optionalDependencies: StringRecord | undefined;
}

export interface PnpmWorkspaceConfiguration {
  readonly path: string;
  readonly sourceText: string;
  readonly exists: boolean;
  readonly packages: ReadonlyArray<string> | undefined;
  readonly overrides: StringRecord | undefined;
}

export interface ConsumerConfiguration {
  readonly packageJson: PackageJsonConfiguration;
  readonly pnpmWorkspace: PnpmWorkspaceConfiguration;
}

export type ConsumerConfigurationEdit =
  | {
      readonly kind: "package-json-workspaces";
      readonly value: DesiredValue<ReadonlyArray<string>>;
    }
  | {
      readonly kind: "package-json-overrides";
      readonly value: DesiredValue<JsonRecord>;
    }
  | {
      readonly kind: "package-json-resolutions";
      readonly value: DesiredValue<StringRecord>;
    }
  | {
      readonly kind: "package-json-dependency";
      readonly packageName: PackageName;
      readonly section: DependencySection;
      readonly value: DesiredValue<string>;
    }
  | {
      readonly kind: "pnpm-workspace-packages";
      readonly value: DesiredValue<ReadonlyArray<string>>;
    }
  | {
      readonly kind: "pnpm-workspace-overrides";
      readonly value: DesiredValue<StringRecord>;
    };

export interface ConsumerConfigurationPlan {
  readonly manager: DetectedPackageManager;
  readonly baselineCaptures: ReadonlyArray<ManagedFieldBaseline>;
  readonly edits: ReadonlyArray<ConsumerConfigurationEdit>;
  readonly removePnpmWorkspaceFileIfEmpty: boolean;
}

export interface CommittedDependency {
  readonly packageName: PackageName;
  readonly section: DependencySection;
  readonly value: string;
}

export interface StashedPackageLink {
  readonly link: LinkRecord;
  readonly version: PackageVersion;
}

export type ConsumerConfigurationTarget =
  | {
      readonly kind: "active";
      readonly links: ReadonlyArray<LinkRecord>;
    }
  | {
      readonly kind: "stashed";
      readonly packages: ReadonlyArray<StashedPackageLink>;
    }
  | {
      readonly kind: "committed";
      readonly dependencies: ReadonlyArray<CommittedDependency>;
    };

const JsonObject = Schema.Record(Schema.String, Schema.Json);
const OptionalStringArray = Schema.UndefinedOr(Schema.Array(Schema.String));
const OptionalJsonRecord = Schema.UndefinedOr(JsonObject);
const OptionalStringRecord = Schema.UndefinedOr(Schema.Record(Schema.String, Schema.String));

const decodeJsonObject = Schema.decodeUnknownEffect(JsonObject);
const jsonValuesAreEquivalent = Schema.toEquivalence(Schema.Json);

const desiredValueIsCurrent = (current: JsonValue | undefined, desired: DesiredValue<JsonValue>) =>
  desired.kind === "missing"
    ? current === undefined
    : current !== undefined && jsonValuesAreEquivalent(current, desired.value);

const decodeConfigurationField = <S extends Schema.Top>(options: {
  readonly schema: S;
  readonly input: unknown;
  readonly path: string;
  readonly field: string;
}) =>
  Schema.decodeUnknownEffect(options.schema)(options.input).pipe(
    Effect.catchTag("SchemaError", (cause) =>
      Effect.fail(
        new UnsupportedConsumerConfigurationError({
          path: options.path,
          field: options.field,
          cause,
        }),
      ),
    ),
  );

const readJsonObject = Effect.fn("ConsumerConfiguration.readJsonObject")(function* (
  filePath: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const sourceText = yield* fs.readFileString(filePath).pipe(
    Effect.catchTag("PlatformError", (cause) =>
      Effect.fail(
        new ConsumerConfigurationReadError({
          path: filePath,
          cause,
        }),
      ),
    ),
  );
  const errors: Array<ParseError> = [];
  const input: unknown = parse(sourceText, errors, { allowTrailingComma: false });
  if (errors.length > 0) {
    return yield* new ConsumerConfigurationReadError({
      path: filePath,
      cause: new Error("file contains invalid JSON"),
    });
  }
  const root = yield* decodeJsonObject(input).pipe(
    Effect.catchTag("SchemaError", (cause) =>
      Effect.fail(
        new ConsumerConfigurationReadError({
          path: filePath,
          cause,
        }),
      ),
    ),
  );
  return { sourceText, root };
});

const readPackageJsonConfiguration = Effect.fn("ConsumerConfiguration.readPackageJson")(function* (
  consumerRoot: AbsolutePath,
) {
  const path = yield* Path.Path;
  const packageJsonPath = path.join(consumerRoot, "package.json");
  const { root, sourceText } = yield* readJsonObject(packageJsonPath);
  const workspaces = yield* decodeConfigurationField({
    schema: OptionalStringArray,
    input: root.workspaces,
    path: packageJsonPath,
    field: "package.json workspaces",
  });
  const overrides = yield* decodeConfigurationField({
    schema: OptionalJsonRecord,
    input: root.overrides,
    path: packageJsonPath,
    field: "package.json overrides",
  });
  const resolutions = yield* decodeConfigurationField({
    schema: OptionalStringRecord,
    input: root.resolutions,
    path: packageJsonPath,
    field: "package.json resolutions",
  });
  const dependencies = yield* decodeConfigurationField({
    schema: OptionalStringRecord,
    input: root.dependencies,
    path: packageJsonPath,
    field: "package.json dependencies",
  });
  const devDependencies = yield* decodeConfigurationField({
    schema: OptionalStringRecord,
    input: root.devDependencies,
    path: packageJsonPath,
    field: "package.json devDependencies",
  });
  const optionalDependencies = yield* decodeConfigurationField({
    schema: OptionalStringRecord,
    input: root.optionalDependencies,
    path: packageJsonPath,
    field: "package.json optionalDependencies",
  });

  return {
    path: packageJsonPath,
    sourceText,
    workspaces,
    overrides,
    resolutions,
    dependencies,
    devDependencies,
    optionalDependencies,
  } satisfies PackageJsonConfiguration;
});

const readPnpmWorkspaceConfiguration = Effect.fn("ConsumerConfiguration.readPnpmWorkspace")(
  function* (consumerRoot: AbsolutePath) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const workspacePath = path.join(consumerRoot, "pnpm-workspace.yaml");
    const exists = yield* fs.exists(workspacePath).pipe(
      Effect.catchTag("PlatformError", (cause) =>
        Effect.fail(
          new ConsumerConfigurationReadError({
            path: workspacePath,
            cause,
          }),
        ),
      ),
    );

    if (!exists) {
      return {
        path: workspacePath,
        sourceText: "",
        exists: false,
        packages: undefined,
        overrides: undefined,
      } satisfies PnpmWorkspaceConfiguration;
    }

    const sourceText = yield* fs.readFileString(workspacePath).pipe(
      Effect.catchTag("PlatformError", (cause) =>
        Effect.fail(
          new ConsumerConfigurationReadError({
            path: workspacePath,
            cause,
          }),
        ),
      ),
    );
    const document = parseDocument(sourceText);
    if (document.errors.length > 0) {
      return yield* new ConsumerConfigurationReadError({
        path: workspacePath,
        cause: document.errors[0] ?? new Error("file contains invalid YAML"),
      });
    }
    const input: unknown = document.toJS();
    const root = yield* decodeJsonObject(input).pipe(
      Effect.catchTag("SchemaError", (cause) =>
        Effect.fail(
          new ConsumerConfigurationReadError({
            path: workspacePath,
            cause,
          }),
        ),
      ),
    );
    const packages = yield* decodeConfigurationField({
      schema: OptionalStringArray,
      input: root.packages,
      path: workspacePath,
      field: "pnpm-workspace.yaml packages",
    });
    const overrides = yield* decodeConfigurationField({
      schema: OptionalStringRecord,
      input: root.overrides,
      path: workspacePath,
      field: "pnpm-workspace.yaml overrides",
    });

    return {
      path: workspacePath,
      sourceText,
      exists: true,
      packages,
      overrides,
    } satisfies PnpmWorkspaceConfiguration;
  },
);

export const readConsumerConfiguration = Effect.fn("ConsumerConfiguration.read")(function* (
  consumerRoot: AbsolutePath,
) {
  const [packageJson, pnpmWorkspace] = yield* Effect.all([
    readPackageJsonConfiguration(consumerRoot),
    readPnpmWorkspaceConfiguration(consumerRoot),
  ]);
  return { packageJson, pnpmWorkspace } satisfies ConsumerConfiguration;
});

const previousValue = <A>(value: A | undefined): DesiredValue<A> =>
  value === undefined ? { kind: "missing" } : { kind: "present", value };

const mergeWorkspacePaths = (
  baseline: DesiredValue<ReadonlyArray<string>>,
  links: ReadonlyArray<LinkRecord>,
  consumerRoot: AbsolutePath,
  path: Path.Path,
) => {
  if (links.length === 0) {
    return baseline;
  }
  const paths = baseline.kind === "present" ? [...baseline.value] : [];
  for (const link of links) {
    const relativePath = path
      .relative(consumerRoot, link.materializedRoot)
      .split(path.sep)
      .join("/");
    if (!paths.includes(relativePath)) {
      paths.push(relativePath);
    }
  }
  return { kind: "present", value: paths } satisfies DesiredValue<ReadonlyArray<string>>;
};

const mergeJsonOverrides = (
  baseline: DesiredValue<JsonRecord>,
  links: ReadonlyArray<LinkRecord>,
  valueFor: (link: LinkRecord) => string,
) => {
  if (links.length === 0) {
    return baseline;
  }
  const overrides: Record<string, JsonValue> =
    baseline.kind === "present" ? { ...baseline.value } : {};
  for (const link of links) {
    overrides[link.packageName] = valueFor(link);
  }
  return { kind: "present", value: overrides } satisfies DesiredValue<JsonRecord>;
};

const mergeStringOverrides = (
  baseline: DesiredValue<StringRecord>,
  links: ReadonlyArray<LinkRecord>,
  valueFor: (link: LinkRecord) => string,
) => {
  if (links.length === 0) {
    return baseline;
  }
  const overrides: Record<string, string> =
    baseline.kind === "present" ? { ...baseline.value } : {};
  for (const link of links) {
    overrides[link.packageName] = valueFor(link);
  }
  return { kind: "present", value: overrides } satisfies DesiredValue<StringRecord>;
};

const mergeJsonVersionOverrides = (
  baseline: DesiredValue<JsonRecord>,
  packages: ReadonlyArray<StashedPackageLink>,
) => {
  if (packages.length === 0) {
    return baseline;
  }
  const overrides: Record<string, JsonValue> =
    baseline.kind === "present" ? { ...baseline.value } : {};
  for (const entry of packages) {
    overrides[entry.link.packageName] = entry.version;
  }
  return { kind: "present", value: overrides } satisfies DesiredValue<JsonRecord>;
};

const mergeStringVersionOverrides = (
  baseline: DesiredValue<StringRecord>,
  packages: ReadonlyArray<StashedPackageLink>,
) => {
  if (packages.length === 0) {
    return baseline;
  }
  const overrides: Record<string, string> =
    baseline.kind === "present" ? { ...baseline.value } : {};
  for (const entry of packages) {
    overrides[entry.link.packageName] = entry.version;
  }
  return { kind: "present", value: overrides } satisfies DesiredValue<StringRecord>;
};

const relativeLinkSpecifier = (
  consumerRoot: AbsolutePath,
  materializedRoot: AbsolutePath,
  protocol: "link" | "portal",
  path: Path.Path,
) => {
  const relativePath = path.relative(consumerRoot, materializedRoot).split(path.sep).join("/");
  const explicitRelativePath = relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
  return `${protocol}:${explicitRelativePath}`;
};

export const planConsumerConfiguration = Effect.fn("ConsumerConfiguration.plan")(
  function* (options: {
    readonly consumerRoot: AbsolutePath;
    readonly manager: DetectedPackageManager;
    readonly current: ConsumerConfiguration;
    readonly baselines: ReadonlyArray<ManagedFieldBaseline>;
    readonly target: ConsumerConfigurationTarget;
  }) {
    const path = yield* Path.Path;
    const captures: Array<ManagedFieldBaseline> = [];
    const edits: Array<ConsumerConfigurationEdit> = [];
    const links =
      options.target.kind === "active"
        ? options.target.links
        : options.target.kind === "stashed"
          ? options.target.packages.map((entry) => entry.link)
          : [];

    const packageWorkspaceBaseline = options.baselines.find(
      (baseline) => baseline.kind === "package-json-workspaces",
    );
    const packageOverrideBaseline = options.baselines.find(
      (baseline) => baseline.kind === "package-json-overrides",
    );
    const packageResolutionBaseline = options.baselines.find(
      (baseline) => baseline.kind === "package-json-resolutions",
    );
    const pnpmPackagesBaseline = options.baselines.find(
      (baseline) => baseline.kind === "pnpm-workspace-packages",
    );
    const pnpmOverrideBaseline = options.baselines.find(
      (baseline) => baseline.kind === "pnpm-workspace-overrides",
    );

    const usePackageWorkspaces = () => {
      const previous =
        packageWorkspaceBaseline?.previous ?? previousValue(options.current.packageJson.workspaces);
      if (packageWorkspaceBaseline === undefined && options.target.kind === "active") {
        captures.push({ kind: "package-json-workspaces", previous });
      }
      edits.push({
        kind: "package-json-workspaces",
        value:
          options.target.kind === "active"
            ? mergeWorkspacePaths(previous, links, options.consumerRoot, path)
            : previous,
      });
    };

    const usePackageOverrides = (valueFor: (link: LinkRecord) => string) => {
      const previous =
        packageOverrideBaseline?.previous ?? previousValue(options.current.packageJson.overrides);
      if (packageOverrideBaseline === undefined && options.target.kind === "active") {
        captures.push({ kind: "package-json-overrides", previous });
      }
      edits.push({
        kind: "package-json-overrides",
        value:
          options.target.kind === "active"
            ? mergeJsonOverrides(previous, links, valueFor)
            : options.target.kind === "stashed"
              ? mergeJsonVersionOverrides(previous, options.target.packages)
              : previous,
      });
    };

    const usePnpmWorkspace = (valueFor: (link: LinkRecord) => string) => {
      const packagesPrevious =
        pnpmPackagesBaseline?.previous ?? previousValue(options.current.pnpmWorkspace.packages);
      const overridesPrevious =
        pnpmOverrideBaseline?.previous ?? previousValue(options.current.pnpmWorkspace.overrides);
      if (pnpmPackagesBaseline === undefined && options.target.kind === "active") {
        captures.push({
          kind: "pnpm-workspace-packages",
          fileExisted: options.current.pnpmWorkspace.exists,
          previous: packagesPrevious,
        });
      }
      if (pnpmOverrideBaseline === undefined && options.target.kind === "active") {
        captures.push({ kind: "pnpm-workspace-overrides", previous: overridesPrevious });
      }
      edits.push(
        {
          kind: "pnpm-workspace-packages",
          value:
            options.target.kind === "active"
              ? mergeWorkspacePaths(packagesPrevious, links, options.consumerRoot, path)
              : packagesPrevious,
        },
        {
          kind: "pnpm-workspace-overrides",
          value:
            options.target.kind === "active"
              ? mergeStringOverrides(overridesPrevious, links, valueFor)
              : options.target.kind === "stashed"
                ? mergeStringVersionOverrides(overridesPrevious, options.target.packages)
                : overridesPrevious,
        },
      );
    };

    const dependencyEdits = new Map<string, ConsumerConfigurationEdit>();
    const setDependency = (
      packageName: PackageName,
      section: DependencySection,
      value: DesiredValue<string>,
    ) => {
      dependencyEdits.set(`${section}\0${packageName}`, {
        kind: "package-json-dependency",
        packageName,
        section,
        value,
      });
    };

    for (const baseline of options.baselines) {
      if (baseline.kind === "package-json-dependency") {
        setDependency(baseline.packageName, baseline.section, baseline.previous);
      }
    }

    switch (options.manager.kind) {
      case "npm": {
        usePackageWorkspaces();
        usePackageOverrides((link) => `file:${link.materializedRoot}`);

        const dependencySections: ReadonlyArray<{
          readonly section: DependencySection;
          readonly values: StringRecord | undefined;
        }> = [
          { section: "dependencies", values: options.current.packageJson.dependencies },
          { section: "devDependencies", values: options.current.packageJson.devDependencies },
          {
            section: "optionalDependencies",
            values: options.current.packageJson.optionalDependencies,
          },
        ];

        if (options.target.kind === "active") {
          for (const link of links) {
            for (const dependencySection of dependencySections) {
              const existingBaseline = options.baselines.find(
                (baseline) =>
                  baseline.kind === "package-json-dependency" &&
                  baseline.packageName === link.packageName &&
                  baseline.section === dependencySection.section,
              );
              const currentValue = dependencySection.values?.[link.packageName];
              if (existingBaseline === undefined && currentValue !== undefined) {
                captures.push({
                  kind: "package-json-dependency",
                  packageName: link.packageName,
                  section: dependencySection.section,
                  previous: { kind: "present", value: currentValue },
                });
              }
              if (existingBaseline !== undefined || currentValue !== undefined) {
                setDependency(link.packageName, dependencySection.section, {
                  kind: "present",
                  value: `file:${link.materializedRoot}`,
                });
              }
            }
          }
        } else if (options.target.kind === "stashed") {
          for (const stashedPackage of options.target.packages) {
            for (const dependencySection of dependencySections) {
              const existingBaseline = options.baselines.find(
                (baseline) =>
                  baseline.kind === "package-json-dependency" &&
                  baseline.packageName === stashedPackage.link.packageName &&
                  baseline.section === dependencySection.section,
              );
              const currentValue = dependencySection.values?.[stashedPackage.link.packageName];
              if (existingBaseline === undefined && currentValue !== undefined) {
                captures.push({
                  kind: "package-json-dependency",
                  packageName: stashedPackage.link.packageName,
                  section: dependencySection.section,
                  previous: { kind: "present", value: currentValue },
                });
              }
              if (existingBaseline !== undefined || currentValue !== undefined) {
                setDependency(stashedPackage.link.packageName, dependencySection.section, {
                  kind: "present",
                  value: stashedPackage.version,
                });
              }
            }
          }
        }
        break;
      }
      case "pnpm":
        usePnpmWorkspace(() => "workspace:*");
        break;
      case "yarn": {
        const previous =
          packageResolutionBaseline?.previous ??
          previousValue(options.current.packageJson.resolutions);
        if (packageResolutionBaseline === undefined && options.target.kind === "active") {
          captures.push({ kind: "package-json-resolutions", previous });
        }
        const protocol = options.manager.generation === "classic" ? "link" : "portal";
        edits.push({
          kind: "package-json-resolutions",
          value:
            options.target.kind === "active"
              ? mergeStringOverrides(previous, links, (link) =>
                  relativeLinkSpecifier(
                    options.consumerRoot,
                    link.materializedRoot,
                    protocol,
                    path,
                  ),
                )
              : options.target.kind === "stashed"
                ? mergeStringVersionOverrides(previous, options.target.packages)
                : previous,
        });
        break;
      }
      case "bun":
        usePackageWorkspaces();
        usePackageOverrides(() => "workspace:*");
        break;
      case "aube":
        if (options.current.pnpmWorkspace.exists) {
          usePnpmWorkspace((link) =>
            relativeLinkSpecifier(options.consumerRoot, link.materializedRoot, "link", path),
          );
        } else {
          usePackageWorkspaces();
          usePackageOverrides((link) =>
            relativeLinkSpecifier(options.consumerRoot, link.materializedRoot, "link", path),
          );
        }
        break;
      default:
        return options.manager satisfies never;
    }

    if (options.target.kind === "committed") {
      for (const dependency of options.target.dependencies) {
        setDependency(dependency.packageName, dependency.section, {
          kind: "present",
          value: dependency.value,
        });
      }
    }

    edits.push(...dependencyEdits.values());

    return {
      manager: options.manager,
      baselineCaptures: captures,
      edits,
      removePnpmWorkspaceFileIfEmpty:
        (options.target.kind !== "active" || links.length === 0) &&
        pnpmPackagesBaseline?.fileExisted === false,
    } satisfies ConsumerConfigurationPlan;
  },
);

const jsonFormattingOptions = (text: string): FormattingOptions => {
  const indentation = text.match(/\n([ \t]+)"/)?.[1] ?? "  ";
  return {
    insertSpaces: !indentation.includes("\t"),
    tabSize: indentation.includes("\t") ? 1 : indentation.length,
    eol: text.includes("\r\n") ? "\r\n" : "\n",
  };
};

const applyPackageJsonEdits = Effect.fn("ConsumerConfiguration.applyPackageJson")(function* (
  configuration: PackageJsonConfiguration,
  edits: ReadonlyArray<ConsumerConfigurationEdit>,
) {
  return yield* Effect.try({
    try: () => {
      let text = configuration.sourceText;
      const formattingOptions = jsonFormattingOptions(text);
      for (const edit of edits) {
        let jsonPath: ReadonlyArray<string> | undefined;
        let value: JsonValue | ReadonlyArray<string> | undefined;
        switch (edit.kind) {
          case "package-json-workspaces":
            jsonPath = ["workspaces"];
            value = edit.value.kind === "present" ? edit.value.value : undefined;
            break;
          case "package-json-overrides":
            jsonPath = ["overrides"];
            value = edit.value.kind === "present" ? edit.value.value : undefined;
            break;
          case "package-json-resolutions":
            jsonPath = ["resolutions"];
            value = edit.value.kind === "present" ? edit.value.value : undefined;
            break;
          case "package-json-dependency":
            jsonPath = [edit.section, edit.packageName];
            value = edit.value.kind === "present" ? edit.value.value : undefined;
            break;
          case "pnpm-workspace-packages":
          case "pnpm-workspace-overrides":
            continue;
          default:
            return edit satisfies never;
        }
        text = applyEdits(text, modify(text, [...jsonPath], value, { formattingOptions }));
      }
      return text;
    },
    catch: (cause) =>
      new ConsumerConfigurationWriteError({
        path: configuration.path,
        cause,
      }),
  });
});

const applyPnpmWorkspaceEdits = Effect.fn("ConsumerConfiguration.applyPnpmWorkspace")(function* (
  configuration: PnpmWorkspaceConfiguration,
  edits: ReadonlyArray<ConsumerConfigurationEdit>,
) {
  return yield* Effect.try({
    try: () => {
      const document = parseDocument(configuration.sourceText);
      if (document.errors.length > 0) {
        throw document.errors[0] ?? new Error("file contains invalid YAML");
      }
      for (const edit of edits) {
        switch (edit.kind) {
          case "pnpm-workspace-packages":
            if (edit.value.kind === "present") {
              document.setIn(["packages"], edit.value.value);
            } else {
              document.deleteIn(["packages"]);
            }
            break;
          case "pnpm-workspace-overrides":
            if (edit.value.kind === "present") {
              document.setIn(["overrides"], edit.value.value);
            } else {
              document.deleteIn(["overrides"]);
            }
            break;
          case "package-json-workspaces":
          case "package-json-overrides":
          case "package-json-resolutions":
          case "package-json-dependency":
            continue;
          default:
            return edit satisfies never;
        }
      }
      return document.toString({ lineWidth: 0 });
    },
    catch: (cause) =>
      new ConsumerConfigurationWriteError({
        path: configuration.path,
        cause,
      }),
  });
});

export const applyConsumerConfiguration = Effect.fn("ConsumerConfiguration.apply")(function* (
  current: ConsumerConfiguration,
  plan: ConsumerConfigurationPlan,
) {
  const fs = yield* FileSystem.FileSystem;
  const hasPackageJsonEdits = plan.edits.some((edit) => edit.kind.startsWith("package-json-"));
  const hasPnpmWorkspaceEdits = plan.edits.some((edit) => edit.kind.startsWith("pnpm-workspace-"));

  if (hasPackageJsonEdits) {
    const text = yield* applyPackageJsonEdits(current.packageJson, plan.edits);
    yield* fs.writeFileString(current.packageJson.path, text).pipe(
      Effect.catchTag("PlatformError", (cause) =>
        Effect.fail(
          new ConsumerConfigurationWriteError({
            path: current.packageJson.path,
            cause,
          }),
        ),
      ),
    );
  }

  if (hasPnpmWorkspaceEdits) {
    const text = yield* applyPnpmWorkspaceEdits(current.pnpmWorkspace, plan.edits);
    if (plan.removePnpmWorkspaceFileIfEmpty && text.trim() === "{}") {
      yield* fs.remove(current.pnpmWorkspace.path, { force: true }).pipe(
        Effect.catchTag("PlatformError", (cause) =>
          Effect.fail(
            new ConsumerConfigurationWriteError({
              path: current.pnpmWorkspace.path,
              cause,
            }),
          ),
        ),
      );
    } else {
      yield* fs.writeFileString(current.pnpmWorkspace.path, text).pipe(
        Effect.catchTag("PlatformError", (cause) =>
          Effect.fail(
            new ConsumerConfigurationWriteError({
              path: current.pnpmWorkspace.path,
              cause,
            }),
          ),
        ),
      );
    }
  }
});

export const consumerConfigurationNeedsApply = (
  current: ConsumerConfiguration,
  plan: ConsumerConfigurationPlan,
) =>
  plan.edits.some((edit) => {
    switch (edit.kind) {
      case "package-json-workspaces":
        return !desiredValueIsCurrent(current.packageJson.workspaces, edit.value);
      case "package-json-overrides":
        return !desiredValueIsCurrent(current.packageJson.overrides, edit.value);
      case "package-json-resolutions":
        return !desiredValueIsCurrent(current.packageJson.resolutions, edit.value);
      case "package-json-dependency": {
        const section = current.packageJson[edit.section];
        return !desiredValueIsCurrent(section?.[edit.packageName], edit.value);
      }
      case "pnpm-workspace-packages":
        return !desiredValueIsCurrent(current.pnpmWorkspace.packages, edit.value);
      case "pnpm-workspace-overrides":
        return !desiredValueIsCurrent(current.pnpmWorkspace.overrides, edit.value);
      default:
        return edit satisfies never;
    }
  });
