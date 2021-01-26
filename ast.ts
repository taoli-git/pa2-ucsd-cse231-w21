import { type } from "os"

export type Parameter =
    { name: string, type: Type }

export type Decl = 
    { tag: "init", name: string, type: Type, value: Expr }

export type Stmt =
    { tag: "assign", name: string, value: Expr }
  | { tag: "decl", decl: Decl }
  | { tag: "define", name: string, parameters: Array<Parameter>, ret: literal, decls: Array<Decl>, body: Array<Stmt> }
  | { tag: "return", value: Expr }
  | { tag: "if", cond: Expr, thn: Array<Stmt>, els: Array<Stmt> }
  | { tag: "while", cond: Expr, body: Array<Stmt> }
  | { tag: "expr", expr: Expr }
  | { tag: "pass" }


export type Expr = 
    { tag: "none" }
  | { tag: "bool", value: boolean }
  | { tag: "num", value: number }
  | { tag: "id", name: string }
  | { tag: "op", op: Op, left: Expr, right: Expr }
  | { tag: "builtin1", name: string, arg: Expr }
  | { tag: "builtin2", name: string, left: Expr, right: Expr }
  | { tag: "call", name: string, arguments: Array<Expr> }

export type literal = number | boolean | void;

export enum Type { None, Bool, Int } ;

export enum Op { Plus, Minus, Times, Div, Mod, Eq, Neq, Leq, Geq, Lt, Gt, Is } ;



    



