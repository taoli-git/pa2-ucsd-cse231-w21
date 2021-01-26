import { statSync } from 'fs';
import wabt from 'wabt';
import {Stmt, Expr, Decl, Op} from './ast';
import {parseProgram, traverseExpr} from './parser';

type LocalEnv = Map<string, boolean>;

const CurrentLocalEnv = new Map<string, boolean>();
const LocalEnvStack = [];

// Numbers are offsets into global memory
export type GlobalEnv = {
  globals: Map<string, number>;
  offset: number;
}

function envLookup(env : GlobalEnv, name : string) : number {
  if(!env.globals.has(name)) { console.log("Could not find " + name + " in ", env); throw new Error("Could not find name " + name); }
  return (env.globals.get(name) * 4); // 4-byte values
}

export const emptyEnv = { globals: new Map(), offset: 0 };

export async function run(watSource : string) : Promise<number> {
  const wabtApi = await wabt();

  // Next three lines are wat2wasm
  const parsed = wabtApi.parseWat("example", watSource);
  const binary = parsed.toBinary({});
  const wasmModule = await WebAssembly.instantiate(binary.buffer, {});

  // This next line is wasm-interp
  return (wasmModule.instance.exports as any)._start();
}

(window as any)["runWat"] = run;

export function codeGenExpr(expr : Expr) : Array<string> {
  // LSB as type info
  switch(expr.tag) {
    case "none": return [`(i64.const 0)`];
    case "id": return [`(local.get $${expr.name})`];
    case "bool":
      if(expr.value) return [`(i64.const 2)`];
      else return [`(i64.const 4)`];
    case "num": 
      const ret = expr.value * 2 + 1;
      return [`(i64.const ${ret}}`];
    case "op":
      const lexpr = codeGenExpr(expr.left).join();
      const rexpr = codeGenExpr(expr.right).join();
      switch(expr.op){
        case Op.Plus:
          return ["(i32.add " + lexpr + " " + rexpr + ")"];
        case Op.Minus:
          return ["(i32.sub " + lexpr + " " + rexpr + ")"];
        case Op.Times:
          return ["(i32.mul " + lexpr + " " + rexpr + ")"];
        case Op.Div:
          return ["(i32.div_s " + lexpr + " " + rexpr + ")"];
        case Op.Mod:
          return ["(i32.rem_s " + lexpr + " " + rexpr + ")"];
        case Op.Eq:
          return ["(i32.eq " + lexpr + " " + rexpr + ")"];
        case Op.Neq:
          return ["(i32.ne " + lexpr + " " + rexpr + ")"];
        case Op.Leq:
          return ["(i32.le_s " + lexpr + " " + rexpr + ")"];
        case Op.Geq:
          return ["(i32.ge_s " + lexpr + " " + rexpr + ")"];
        case Op.Lt:
          return ["(i32.lt_s " + lexpr + " " + rexpr + ")"];
        case Op.Gt:
          return ["(i32.gt_s " + lexpr + " " + rexpr + ")"];
        case Op.Is:
          // type check and return a i32 represented boolean
          return [];
        default:
          throw new Error("Invalid BinaryOperator");
      }
    case "builtin1":
      const argStmts = codeGenExpr(expr.arg);
      return argStmts.concat([`(call $${expr.name})`]);
    case "builtin2":
      const arg1 = codeGenExpr(expr.left).join();
      const arg2 = codeGenExpr(expr.right).join();
      return [`(call $${expr.name}` + arg1 + ` ` + arg2 + `)`];
    case "call":
      var valStmts = codeGenExpr(expr.arguments[0]);
      valStmts.push(`(call $${expr.name})`);
      return valStmts;
  }
}
export function codeGenDecl(decl : Decl, lenv : LocalEnv, genv : GlobalEnv, isGlobal : boolean) : Array<string> {
  // duplicate declarations

  // type check

  // add redundant information for type 
  // i32 type i32 value -- i64
  // None 0
  // FAlse 2
  // True 4
  // Number 2*n + 1
  switch(isGlobal) {
    case true:
      const locationToStore = [`(i32.const ${envLookup(genv, decl.name)}) ;; ${decl.name}`];
      var valStmts = codeGenExpr(decl.value);
      return locationToStore.concat(valStmts).concat([`(i32.store)`]);
    case false:
      lenv.set(decl.name, true);
      var valStmts = codeGenExpr(decl.value);
      valStmts.push(`(local.set $${decl.name})`);
      return valStmts;

  }
}
export function codeGenStmt(stmt : Stmt) : Array<string> {
  switch(stmt.tag) {
    case "define":
      var params = stmt.parameters.map(p => `(param $${p.name} i32)`).join(" ");
      var stmts = stmt.body.map(codeGenStmt).flat();
      var stmtsBody = stmts.join("\n");
      return [`(func $${stmt.name} ${params} (result i32) ${stmtsBody})`];
    case "return":
      var valStmts = codeGenExpr(stmt.value);
      valStmts.push("return");
      return valStmts;
    case "assign":
      var valStmts = codeGenExpr(stmt.value);
      valStmts.push(`(local.set $${stmt.name})`);
      return valStmts;
    case "expr":
      const result = codeGenExpr(stmt.expr);
      result.push("(local.set $scratch)");
      return result;
  }
}

type CompileResult = {
  wasmSource: string
  //newEnv: GlobalEnv
};

export function compile(source : string) : CompileResult {
  const ast = parseProgram(source);
  const vars : Array<string> = [];
  ast.forEach((stmt) => {
    if(stmt.tag === "decl") { vars.push(stmt.decl.name); }
  });
  const funs : Array<string> = [];
  ast.forEach((stmt, i) => {
    if(stmt.tag === "define") { funs.push(codeGenStmt(stmt).join("\n")); }
  });
  const allFuns = funs.join("\n\n");
  const stmts = ast.filter((stmt) => stmt.tag !== "define");
  
  const varDecls : Array<string> = [];
  varDecls.push(`(local $scratch i32)`);
  vars.forEach(v => { varDecls.push(`(local $${v} i32)`); });

  const allStmts = stmts.map(codeGenStmt).flat();
  const ourCode = varDecls.concat(allStmts).join("\n");

  const lastStmt = ast[ast.length - 1];
  const isExpr = lastStmt.tag === "expr";
  var retType = "";
  var retVal = "";
  if(isExpr) {
    retType = "(result i32)";
    retVal = "(local.get $scratch)"
  }

  return {
    wasmSource: `
    (module
      ${allFuns}
      (func (export "_start") ${retType}
        ${ourCode}
        ${retVal}
      )
    ) 
  `};
}
