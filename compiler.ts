import { statSync } from 'fs';
import { rootCertificates } from 'tls';
import wabt from 'wabt';
import {Stmt, Expr, Decl, Op, TRUE, FALSE, NONE} from './ast';
import {parseProgram, traverseExpr} from './parser';

type LocalEnv = Map<string, boolean>;

const CurrentLocalEnv = new Map<string, boolean>();
const LocalEnvStack = [];

// Numbers are offsets into global memory
export type Env = {
  vars: Map<string, number>;
  offset: number;
}

function envLookup(env : Env, name : string) : number {
  if(!env.vars.has(name)) { console.log("Could not find " + name + " in ", env); throw new Error("Could not find name " + name); }
  return (env.vars.get(name) * 4); // 4-byte values
}

export const emptyEnv = { globals: new Map(), offset: 0 };

export async function run(watSource : string, config: any) : Promise<number> {
  const wabtApi = await wabt();

  // Next three lines are wat2wasm
  const parsed = wabtApi.parseWat("example", watSource);
  const binary = parsed.toBinary({});
  const importObject = config.importObject;
  const wasmModule = await WebAssembly.instantiate(binary.buffer, importObject);

  // This next line is wasm-interp
  return (wasmModule.instance.exports as any)._start();
}

(window as any)["runWat"] = run;

export function codeGenExpr(expr : Expr) : Array<string> {
  // LSB as type info
  switch(expr.tag) {
    case "none": return [`(i64.const ${NONE})`];
    case "id": return [`(local.get $${expr.name})`];
    case "bool":
      if(expr.value) return [`(i64.const ${TRUE})`];
      else return [`(i64.const ${FALSE})`];
    case "num": 
      const ret = expr.value<<1 | 1;
      return [`(i64.const ${ret})`];
    case "uop":
      // TODO type check and set boolean or number
      const uexpr = codeGenExpr(expr.arg).join();
      switch(expr.op){
        case Op.Neg:
          return ["(i64.sub (i64.const 2) " + uexpr + ")"];
        case Op.Not:
          // type check and return a i32 represented boolean
          return ['(if (result i64) (i64.eq (i64.const 2) ' + uexpr + 
            ') (then (i64.const 4))(else (i64.const 2)) )'];
        default:
          throw new Error("Invalid UnaryOperator");
      }
    case "op":
      const lexpr = codeGenExpr(expr.left).join();
      const rexpr = codeGenExpr(expr.right).join();
      switch(expr.op){
        case Op.Plus:
          return ["(i64.add " + lexpr + " " + rexpr + ")"];
        case Op.Minus:
          return ["(i64.sub " + lexpr + " " + rexpr + ")"];
        case Op.Times:
          return ["(i64.mul " + lexpr + " " + rexpr + ")"];
        case Op.Div:
          return ["(i64.div_s " + lexpr + " " + rexpr + ")"];
        case Op.Mod:
          return ["(i64.rem_s " + lexpr + " " + rexpr + ")"];
        case Op.Eq:
          return ["(i64.eq " + lexpr + " " + rexpr + ")"];
        case Op.Neq:
          return ["(i64.ne " + lexpr + " " + rexpr + ")"];
        case Op.Leq:
          return ["(i64.le_s " + lexpr + " " + rexpr + ")"];
        case Op.Geq:
          return ["(i64.ge_s " + lexpr + " " + rexpr + ")"];
        case Op.Lt:
          return ["(i64.lt_s " + lexpr + " " + rexpr + ")"];
        case Op.Gt:
          return ["(i64.gt_s " + lexpr + " " + rexpr + ")"];
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
export function codeGenDecl(decl : Decl, env : Env) : Array<string> {
  // duplicate declarations

  // type check

  // add redundant information for type 
  // i32 type i32 value -- i64
  // None 0
  // FAlse 2
  // True 4
  // Number 2*n + 1
  const locationToStore = [`(i64.const ${envLookup(env, decl.name)}) ;; ${decl.name}`];
  var valStmts = codeGenExpr(decl.value);
  return locationToStore.concat(valStmts).concat([`(i64.store)`]);
}
export function codeGenStmt(stmt : Stmt) : Array<string> {
  switch(stmt.tag) {
    case "define":
      var params = stmt.parameters.map(p => `(param $${p.name} i64)`).join(" ");
      var stmts = stmt.body.map(codeGenStmt).flat();
      var stmtsBody = stmts.join("\n");
      return [`(func $${stmt.name} ${params} (result i64) ${stmtsBody})`];
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
  const builtinfunc = `(func $print (import "imports" "print") (param i64) (result i64))
    (func $abs (import "imports" "abs") (param i64) (result i64))
    (func $max (import "imports" "max") (param i64) (param i64) (result i64))
    (func $min (import "imports" "min") (param i64) (param i64) (result i64))
    (func $pow (import "imports" "pow") (param i64) (param i64) (result i64))`;
  funs.push(builtinfunc);
  ast.forEach((stmt, i) => {
    if(stmt.tag === "define") { funs.push(codeGenStmt(stmt).join("\n")); }
  });
  const allFuns = funs.join("\n\n");
  const stmts = ast.filter((stmt) => stmt.tag !== "define");
  
  const varDecls : Array<string> = [];
  varDecls.push(`(local $scratch i64)`);
  vars.forEach(v => { varDecls.push(`(local $${v} i64)`); });

  const allStmts = stmts.map(codeGenStmt).flat();
  const ourCode = varDecls.concat(allStmts).join("\n");

  const lastStmt = ast[ast.length - 1];
  const isExpr = lastStmt.tag === "expr";
  var retType = "";
  var retVal = "";
  if(isExpr) {
    retType = "(result i64)";
    retVal = "(i64.shr_s (local.get $scratch) (i64.const 1))"
    
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
