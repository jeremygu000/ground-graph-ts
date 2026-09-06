export type IDPrefix =
  | "ten"
  | "usr"
  | "src"
  | "doc"
  | "ver"
  | "chk"
  | "idx"
  | "ent"
  | "fct"
  | "evd"
  | "run"
  | "stp"
  | "evt";

export interface IDGenerator {
  generate(prefix: IDPrefix): string;
}
