{
  description = "Link local package roots into consumer projects";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    nixpkgs-darwin.url = "github:NixOS/nixpkgs/nixpkgs-26.05-darwin";
  };

  outputs =
    {
      nixpkgs,
      nixpkgs-darwin,
      self,
    }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      nixpkgsFor = system: if system == "x86_64-darwin" then nixpkgs-darwin else nixpkgs;
    in
    {
      packages = nixpkgs.lib.genAttrs systems (
        system:
        let
          pkgs = import (nixpkgsFor system) { inherit system; };
        in
        rec {
          lpm = pkgs.callPackage ./nix/package.nix { src = self; };
          default = lpm;
        }
      );

      formatter = nixpkgs.lib.genAttrs systems (
        system:
        let
          pkgs = import (nixpkgsFor system) { inherit system; };
        in
        pkgs.nixfmt
      );
    };
}
