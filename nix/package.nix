{
  cacert,
  fetchPnpmDeps,
  installShellFiles,
  lib,
  makeWrapper,
  nodejs_24,
  pnpm_11,
  pnpmConfigHook,
  src,
  stdenv,
  writableTmpDirAsHomeHook,
}:

let
  nodejs = nodejs_24;
  pnpm = pnpm_11;
  version = (builtins.fromJSON (builtins.readFile "${src}/package.json")).version;
in
stdenv.mkDerivation (finalAttrs: {
  pname = "lpm";
  inherit version src;
  strictDeps = true;

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    inherit pnpm;
    fetcherVersion = 4;
    hash = "sha256-nItSkX0jweiuFwec15hIvST/1kBgVRIWGDUsISuB4qU=";
  };

  nativeBuildInputs = [
    installShellFiles
    makeWrapper
    nodejs
    pnpm
    pnpmConfigHook
    writableTmpDirAsHomeHook
  ];

  noAuditTmpdir = true;
  SSL_CERT_FILE = "${cacert}/etc/ssl/certs/ca-bundle.crt";

  buildPhase = ''
    runHook preBuild
    pnpm build
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    app="$out/libexec/lpm"
    mkdir -p "$out/bin"
    pnpm --filter @tarik02/lpm --config.inject-workspace-packages=true \
      deploy --prod --offline --ignore-scripts "$app"
    makeWrapper ${lib.getExe nodejs} "$out/bin/lpm" \
      --add-flags "$app/dist/bin.js"
    installShellCompletion --cmd lpm \
      --bash <($out/bin/lpm --completions bash) \
      --fish <($out/bin/lpm --completions fish) \
      --zsh <($out/bin/lpm --completions zsh)

    runHook postInstall
  '';

  meta = {
    description = "Link local package roots into consumer projects";
    homepage = "https://github.com/tarik02-org/lpm";
    license = lib.licenses.mit;
    mainProgram = "lpm";
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
  };
})
