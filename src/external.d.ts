declare module "@npmcli/arborist" {
  export interface ArboristNode {
    readonly path: string;
  }

  export default class Arborist {
    constructor(options: { readonly path: string });
    loadActual(): Promise<ArboristNode>;
  }
}

declare module "npm-packlist" {
  import type { ArboristNode } from "@npmcli/arborist";

  export default function packlist(tree: ArboristNode): Promise<Array<string>>;
}
