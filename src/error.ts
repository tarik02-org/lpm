import * as Schema from "effect/Schema";

const Cause = Schema.Defect();

export class PackageRootRequiredError extends Schema.TaggedError<PackageRootRequiredError>()(
  "PackageRootRequiredError",
  {},
) {
  override get message() {
    return "pass at least one package-root path";
  }
}

export class LpmConfigLocationError extends Schema.TaggedError<LpmConfigLocationError>()(
  "LpmConfigLocationError",
  { cause: Cause },
) {
  override get message() {
    return "could not locate the LPM user config directory";
  }
}

export class LpmConfigReadError extends Schema.TaggedError<LpmConfigReadError>()(
  "LpmConfigReadError",
  { path: Schema.String, cause: Cause },
) {
  override get message() {
    return `could not read LPM config at ${this.path}`;
  }
}

export class LpmConfigDecodeError extends Schema.TaggedError<LpmConfigDecodeError>()(
  "LpmConfigDecodeError",
  { path: Schema.String, cause: Cause },
) {
  override get message() {
    return `invalid LPM config at ${this.path}`;
  }
}

export class InvalidPackageNameError extends Schema.TaggedError<InvalidPackageNameError>()(
  "InvalidPackageNameError",
  { packageName: Schema.String },
) {
  override get message() {
    return `invalid package name '${this.packageName}'`;
  }
}

export class InvalidUnlinkSelectionError extends Schema.TaggedError<InvalidUnlinkSelectionError>()(
  "InvalidUnlinkSelectionError",
  { reason: Schema.String },
) {
  override get message() {
    return this.reason;
  }
}

export class InteractivePromptError extends Schema.TaggedError<InteractivePromptError>()(
  "InteractivePromptError",
  { cause: Cause },
) {
  override get message() {
    return "interactive prompt failed";
  }
}

export class ConflictingPackageRootsError extends Schema.TaggedError<ConflictingPackageRootsError>()(
  "ConflictingPackageRootsError",
  { packageName: Schema.String, packageRoots: Schema.Array(Schema.String) },
) {
  override get message() {
    return `select only one package root for ${this.packageName}; received ${this.packageRoots.join(", ")}`;
  }
}

export class PackageManifestReadError extends Schema.TaggedError<PackageManifestReadError>()(
  "PackageManifestReadError",
  { path: Schema.String, cause: Cause },
) {
  override get message() {
    return `could not read package manifest at ${this.path}`;
  }
}

export class InvalidPackageManifestError extends Schema.TaggedError<InvalidPackageManifestError>()(
  "InvalidPackageManifestError",
  { path: Schema.String, cause: Cause },
) {
  override get message() {
    return `invalid package manifest at ${this.path}`;
  }
}

export class ConsumerRootNotFoundError extends Schema.TaggedError<ConsumerRootNotFoundError>()(
  "ConsumerRootNotFoundError",
  { startPath: Schema.String },
) {
  override get message() {
    return `could not find a package-manager workspace root from ${this.startPath}`;
  }
}

export class ConsumerNotLinkedError extends Schema.TaggedError<ConsumerNotLinkedError>()(
  "ConsumerNotLinkedError",
  { consumerRoot: Schema.String, packageName: Schema.String },
) {
  override get message() {
    return `${this.packageName} is not linked in ${this.consumerRoot}`;
  }
}

export class ConsumerHasNoLinksError extends Schema.TaggedError<ConsumerHasNoLinksError>()(
  "ConsumerHasNoLinksError",
  { consumerRoot: Schema.String },
) {
  override get message() {
    return `no packages are linked in ${this.consumerRoot}`;
  }
}

export class ConsumerAlreadyStashedError extends Schema.TaggedError<ConsumerAlreadyStashedError>()(
  "ConsumerAlreadyStashedError",
  { consumerRoot: Schema.String },
) {
  override get message() {
    return `${this.consumerRoot} is already stashed`;
  }
}

export class ConsumerNotStashedError extends Schema.TaggedError<ConsumerNotStashedError>()(
  "ConsumerNotStashedError",
  { consumerRoot: Schema.String },
) {
  override get message() {
    return `${this.consumerRoot} is not stashed`;
  }
}

export class StashedMutationRequiresForceError extends Schema.TaggedError<StashedMutationRequiresForceError>()(
  "StashedMutationRequiresForceError",
  { consumerRoot: Schema.String },
) {
  override get message() {
    return `${this.consumerRoot} is stashed; pass --force to discard the stash`;
  }
}

export class StashedMutationCancelledError extends Schema.TaggedError<StashedMutationCancelledError>()(
  "StashedMutationCancelledError",
  {},
) {
  override get message() {
    return "stash discard cancelled";
  }
}

export class CommitDependencyMissingError extends Schema.TaggedError<CommitDependencyMissingError>()(
  "CommitDependencyMissingError",
  { packageName: Schema.String },
) {
  override get message() {
    return `${this.packageName} is not a root dependency`;
  }
}

export class UnsupportedCommitDependencySpecifierError extends Schema.TaggedError<UnsupportedCommitDependencySpecifierError>()(
  "UnsupportedCommitDependencySpecifierError",
  {
    packageName: Schema.String,
    section: Schema.String,
    specifier: Schema.String,
  },
) {
  override get message() {
    return `cannot commit ${this.packageName} from unsupported ${this.section} specifier '${this.specifier}'`;
  }
}

export class PackageManagerNotFoundError extends Schema.TaggedError<PackageManagerNotFoundError>()(
  "PackageManagerNotFoundError",
  { consumerRoot: Schema.String, cause: Schema.optionalKey(Cause) },
) {
  override get message() {
    return `could not detect a package manager in ${this.consumerRoot}`;
  }
}

export class ConsumerConfigurationReadError extends Schema.TaggedError<ConsumerConfigurationReadError>()(
  "ConsumerConfigurationReadError",
  { path: Schema.String, cause: Cause },
) {
  override get message() {
    return `could not read consumer configuration at ${this.path}`;
  }
}

export class AmbiguousPackageManagerError extends Schema.TaggedError<AmbiguousPackageManagerError>()(
  "AmbiguousPackageManagerError",
  { consumerRoot: Schema.String, candidates: Schema.Array(Schema.String) },
) {
  override get message() {
    return `multiple package managers are plausible in ${this.consumerRoot}: ${this.candidates.join(", ")}`;
  }
}

export class UnsupportedPackageManagerError extends Schema.TaggedError<UnsupportedPackageManagerError>()(
  "UnsupportedPackageManagerError",
  { packageManager: Schema.String },
) {
  override get message() {
    return `unsupported package manager '${this.packageManager}'`;
  }
}

export class PackageManagerChangedError extends Schema.TaggedError<PackageManagerChangedError>()(
  "PackageManagerChangedError",
  { consumerRoot: Schema.String, previous: Schema.String, detected: Schema.String },
) {
  override get message() {
    return `package manager changed from ${this.previous} to ${this.detected} in ${this.consumerRoot}; repair the managed configuration before continuing`;
  }
}

export class UnsupportedConsumerConfigurationError extends Schema.TaggedError<UnsupportedConsumerConfigurationError>()(
  "UnsupportedConsumerConfigurationError",
  { path: Schema.String, field: Schema.String, cause: Cause },
) {
  override get message() {
    return `unsupported ${this.field} configuration in ${this.path}`;
  }
}

export class ConsumerConfigurationWriteError extends Schema.TaggedError<ConsumerConfigurationWriteError>()(
  "ConsumerConfigurationWriteError",
  { path: Schema.String, cause: Cause },
) {
  override get message() {
    return `could not update consumer configuration at ${this.path}`;
  }
}

export class PackageManagerInstallError extends Schema.TaggedError<PackageManagerInstallError>()(
  "PackageManagerInstallError",
  { consumerRoot: Schema.String, packageManager: Schema.String, cause: Cause },
) {
  override get message() {
    return `${this.packageManager} install failed in ${this.consumerRoot}`;
  }
}

export class StateReadError extends Schema.TaggedError<StateReadError>()("StateReadError", {
  path: Schema.String,
  cause: Cause,
}) {
  override get message() {
    return `could not read LPM state at ${this.path}`;
  }
}

export class StateDecodeError extends Schema.TaggedError<StateDecodeError>()("StateDecodeError", {
  path: Schema.String,
  cause: Cause,
}) {
  override get message() {
    return `invalid LPM state at ${this.path}`;
  }
}

export class StateWriteError extends Schema.TaggedError<StateWriteError>()("StateWriteError", {
  path: Schema.String,
  cause: Cause,
}) {
  override get message() {
    return `could not write LPM state at ${this.path}`;
  }
}

export class StateWatchError extends Schema.TaggedError<StateWatchError>()("StateWatchError", {
  path: Schema.String,
  cause: Cause,
}) {
  override get message() {
    return `could not watch LPM state at ${this.path}`;
  }
}

export class StateLockError extends Schema.TaggedError<StateLockError>()("StateLockError", {
  path: Schema.String,
  cause: Cause,
}) {
  override get message() {
    return `could not acquire LPM mutation lock at ${this.path}`;
  }
}

export class StateLockBusyError extends Schema.TaggedError<StateLockBusyError>()(
  "StateLockBusyError",
  {
    path: Schema.String,
    cause: Cause,
  },
) {
  override get message() {
    return `another LPM mutation is still holding ${this.path}`;
  }
}

export class StatusPathReadError extends Schema.TaggedError<StatusPathReadError>()(
  "StatusPathReadError",
  {
    path: Schema.String,
    cause: Cause,
  },
) {
  override get message() {
    return `could not inspect path at ${this.path}`;
  }
}

export class DoctorIssuesFoundError extends Schema.TaggedError<DoctorIssuesFoundError>()(
  "DoctorIssuesFoundError",
  {
    consumerRoot: Schema.String,
    issueCount: Schema.Number,
  },
) {
  override get message() {
    return `doctor found ${this.issueCount} ${this.issueCount === 1 ? "issue" : "issues"} in ${this.consumerRoot}`;
  }
}

export class PacklistError extends Schema.TaggedError<PacklistError>()("PacklistError", {
  packageRoot: Schema.String,
  cause: Cause,
}) {
  override get message() {
    return `could not select publishable files from ${this.packageRoot}`;
  }
}

export class MaterializationReadError extends Schema.TaggedError<MaterializationReadError>()(
  "MaterializationReadError",
  { path: Schema.String, cause: Cause },
) {
  override get message() {
    return `could not read materialization input at ${this.path}`;
  }
}

export class MaterializationWriteError extends Schema.TaggedError<MaterializationWriteError>()(
  "MaterializationWriteError",
  { path: Schema.String, cause: Cause },
) {
  override get message() {
    return `could not update materialization at ${this.path}`;
  }
}

export class DevelopmentWatchError extends Schema.TaggedError<DevelopmentWatchError>()(
  "DevelopmentWatchError",
  {
    packageName: Schema.String,
    packageRoot: Schema.String,
    cause: Cause,
  },
) {
  override get message() {
    return `could not watch ${this.packageName} at ${this.packageRoot}`;
  }
}

export class ManifestNormalizationError extends Schema.TaggedError<ManifestNormalizationError>()(
  "ManifestNormalizationError",
  { path: Schema.String, cause: Cause },
) {
  override get message() {
    return `could not normalize materialized manifest at ${this.path}`;
  }
}
