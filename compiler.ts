import { ExpressionIds, StoreInfo } from 'binaryen';
import { statSync } from 'fs';
import { off, setMaxListeners } from 'process';
import wabt from 'wabt';
import {Stmt, Expr, Decl, Op, TRUE, FALSE, NONE, Type} from './ast';
import {parseProgram, traverseExpr} from './parser';
import { tcDecl, tcProg } from './typecheck';

type LocalEnv = Map<string, boolean>;

// Numbers are offsets into global memory
export type Env = {
  vars: Map<string, number>;
  types: Map<string, Type>;
  offset: number;
  local: LocalEnv; // variable has been declaraed locally or not
  funcInfo: {
    parameters: Map<string, Array<Type>>;
    returnType: Map<string, Type>;
  }
}

function envLookup(env : Env, name : string) : number {
  if(!env.vars.has(name)) { console.log("Could not find " + name + " in ", env); throw new Error("Could not find name " + name); }
  return (env.vars.get(name) * 8); // 8-byte values i64
}

export const emptyEnv:Env = {
  vars: new Map(),
  types: new Map(),
  offset: 0,
  local: new Map(),
  funcInfo: {
    parameters: new Map(),
    returnType: new Map()
  }
}

export const tcEnv:Env = {
  vars: new Map(),
  types: new Map(),
  offset: 0,
  local: new Map(),
  funcInfo: {
    parameters: new Map(),
    returnType: new Map()
  }
}

export async function run(watSource : string, config: any) : Promise<number> {
  const wabtApi = await wabt();

  // Next three lines are wat2wasm
  const parsed = wabtApi.parseWat("example", watSource);
  const binary = parsed.toBinary({});
  const importObject = config.importObject;
  if(!importObject.js) {
    const memory = new WebAssembly.Memory({initial:10, maximum:100});
    importObject.js = { memory: memory };
  }
  const wasmModule = await WebAssembly.instantiate(binary.buffer, importObject);

  // This next line is wasm-interp
  return (wasmModule.instance.exports as any)._start();
}

(window as any)["runWat"] = run;

export function codeGenExpr(expr : Expr, env : Env) : Array<string> {
  // LSB as type info
  switch(expr.tag) {
    case "none": return [`(i64.const ${NONE})`];
    case "id": 
      if (env.local.has(expr.name)) return [`(local.get $${expr.name})`];
      return [`(i64.load (i32.const ${envLookup(env, expr.name)}))`]
    case "bool":
      if(expr.value) return [`(i64.const ${TRUE})`];
      else return [`(i64.const ${FALSE})`];
    case "num": 
      const ret = expr.value<<1 | 1;
      return [`(i64.const ${ret})`];
    case "uop":
      // TODO type check and set boolean or number
      const uexpr = codeGenExpr(expr.arg, env).join();
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
      const lexpr = codeGenExpr(expr.left, env).join();
      const rexpr = codeGenExpr(expr.right, env).join();
      const lv = "(i64.shr_s " + lexpr + " (i64.const 1))";
      const rv = "(i64.shr_s " + rexpr + " (i64.const 1))";
      switch(expr.op){
        case Op.Plus:
          var code = "(i64.add " + lv + " " + rv + ")";
          return ["(i64.add (i64.const 1) (i64.shl " + code + " (i64.const 1)))"];
        case Op.Minus:
          var code = "(i64.sub " + lv + " " + rv + ")";
          return ["(i64.add (i64.const 1) (i64.shl " + code + " (i64.const 1)))"];
        case Op.Times:
          var code = "(i64.mul " + lv + " " + rv + ")";
          return ["(i64.add (i64.const 1) (i64.shl " + code + " (i64.const 1)))"];
        case Op.Div:
          var code = "(i64.div_s " + lv + " " + rv + ")";
          return ["(i64.add (i64.const 1) (i64.shl " + code + " (i64.const 1)))"];
        case Op.Mod:
          var code = "(i64.rem_s " + lv + " " + rv + ")";
          return ["(i64.add (i64.const 1) (i64.shl " + code + " (i64.const 1)))"];
        case Op.Eq:
          return ['(if (result i64) (i64.eq '+ lexpr + " " + rexpr + 
          ') (then (i64.const 4))(else (i64.const 2)) )'];
        case Op.Neq:
          return ['(if (result i64) (i64.ne '+ lexpr + " " + rexpr + 
          ') (then (i64.const 4))(else (i64.const 2)) )'];
        case Op.Leq:
          return ['(if (result i64) (i64.le_s '+ lexpr + " " + rexpr + 
          ') (then (i64.const 4))(else (i64.const 2)) )'];
        case Op.Geq:
          return ['(if (result i64) (i64.ge_s '+ lexpr + " " + rexpr + 
          ') (then (i64.const 4))(else (i64.const 2)) )'];
        case Op.Lt:
          return ['(if (result i64) (i64.lt_s '+ lexpr + " " + rexpr + 
          ') (then (i64.const 4))(else (i64.const 2)) )'];
        case Op.Gt:
          return ['(if (result i64) (i64.gt_s '+ lexpr + " " + rexpr + 
          ') (then (i64.const 4))(else (i64.const 2)) )'];
        case Op.Is:
          return [`(i64.const ${TRUE})`];
        default:
          throw new Error("Invalid BinaryOperator");
      }
    case "builtin1":
      const argStmts = codeGenExpr(expr.arg, env);
      return argStmts.concat([`(call $${expr.name})`]);
    case "builtin2":
      const arg1 = codeGenExpr(expr.left, env).join();
      const arg2 = codeGenExpr(expr.right, env).join();
      return [`(call $${expr.name}` + arg1 + ` ` + arg2 + `)`];
    case "call":
      var valStmts = expr.arguments.map(p => codeGenExpr(p, env)).flat();
      valStmts.push(`(call $${expr.name})`);
      return valStmts;
  }
}
export function codeGenDecl(decl : Decl, env : Env) : Array<string> {
  //if(!env.local.has(decl.name)) throw new Error("Cannot assign to variable that is not explicitly declared in this scope: " + decl.name);
  //env.local.set(decl.name, true); // mark this variable has been declarared.
  // update info at env
  env.types.set(decl.name, decl.type);
  env.vars.set(decl.name, env.offset);
  env.offset += 1;

  const locationToStore = [`(i32.const ${envLookup(env, decl.name)}) ;; ${decl.name}`];
  var valStmts = codeGenExpr(decl.value, env);
  return locationToStore.concat(valStmts).concat([`(i64.store)`]);
}

export function codeGenStmt(stmt : Stmt, env : Env) : Array<string> {
  switch(stmt.tag) {
    case "define":
      // create a new env for this define
      const newEnv = {
        vars: new Map(env.vars),
        types: new Map(env.types),
        offset: env.offset,
        local: new Map(),
        funcInfo: {
          parameters: new Map(env.funcInfo.parameters),
          returnType: new Map(env.funcInfo.returnType)
        }
      }
      var params = stmt.parameters.map(p => `(param $${p.name} i64)`).join(" ");
      stmt.parameters.map(p => {
        newEnv.local.set(p.name, true);
        newEnv.types.set(p.name, p.type);
      }); // Add parameters' info
      
      var decls = stmt.decls.map(d => `(local $${d.name} i64) `+ 
        codeGenExpr(d.value, newEnv).join() + 
        ` (local.set $${d.name})`).flat().join("\n");
      stmt.decls.map(d => {
        newEnv.local.set(d.name, true);
        newEnv.types.set(d.name, d.type);
      })
      env.offset = newEnv.offset; // update env.offset
      var stmts = stmt.body.map((stmt) => codeGenStmt(stmt, newEnv)).flat();
      var stmtsBody = stmts.join("\n");
      return [`(func $${stmt.name} ${params} (result i64) ${decls} ${stmtsBody})`];
    case "decl":
      return codeGenDecl(stmt.decl, env);
    case "return":
      var valStmts = codeGenExpr(stmt.value, env);
      valStmts.push("return");
      return valStmts;
    case "assign":
      if (env.local.has(stmt.name)) return [ codeGenExpr(stmt.value, env).join() + ` (local.set $${stmt.name})`];

      const locationToStore = [`(i32.const ${envLookup(env, stmt.name)}) ;; ${stmt.name}`];
      var valStmts = codeGenExpr(stmt.value, env);
      return locationToStore.concat(valStmts).concat([`(i64.store)`]);
    case "expr":
      const result = codeGenExpr(stmt.expr, env);
      if (env.local.has("scratch")) result.push("(local.set $scratch)");
      return result;
    case "if":
      const cond = codeGenExpr(stmt.cond, env);
      const thnStmts = stmt.thn.map(p => codeGenStmt(p, env)).flat().join("\n");
      const elsStmts = stmt.els.map(p => codeGenStmt(p, env)).flat().join("\n");
      return [`(if (i64.eq (i64.const ${TRUE}) ` + cond + 
            ') (then ' + thnStmts + ')(else ' + elsStmts + '))'];
    case "while":
      const wcond = codeGenExpr(stmt.cond, env);
      const whileStmts = stmt.body.map(p => codeGenStmt(p, env)).flat().join("\n");
      return [`
      (block 
        (loop
          (i64.eq (i64.const ${FALSE})` 
          + wcond + 
          `) (br_if 1)` +
          whileStmts + 
          `(br 0)
        )
      )`];
    case "pass":
      return [`nop`];
  }
}

type CompileResult = {
  wasmSource: string
  //newEnv: GlobalEnv
};

export function compile(source : string) : CompileResult {
  const ast = parseProgram(source);
  tcProg(ast, tcEnv);
  const GlobalEnv = emptyEnv;
  GlobalEnv.local.set("scratch", true);
  const varDecls : Array<string> = [];
  varDecls.push(`(local $scratch i64)`);
  ast.forEach((stmt) => {
    if(stmt.tag === "decl") { varDecls.push(codeGenDecl(stmt.decl, GlobalEnv).join("\n")); }
  });

  
  const funs : Array<string> = [];
  const builtinfunc = `(func $print (import "imports" "print") (param i64) (result i64))
    (func $abs (import "imports" "abs") (param i64) (result i64))
    (func $max (import "imports" "max") (param i64) (param i64) (result i64))
    (func $min (import "imports" "min") (param i64) (param i64) (result i64))
    (func $pow (import "imports" "pow") (param i64) (param i64) (result i64))`;
  funs.push(builtinfunc);
  
  
  ast.forEach((stmt, i) => {
    if(stmt.tag === "define") { 
      funs.push(codeGenStmt(stmt, GlobalEnv).join("\n"));
      var types:Type[] = [];
      stmt.parameters.forEach(element => {
        types.push(element.type);
      });
      GlobalEnv.funcInfo.parameters.set(stmt.name, types);
      GlobalEnv.funcInfo.returnType.set(stmt.name, stmt.ret);
    }
  });
  const allFuns = funs.join("\n\n");
  const stmts = ast.filter((stmt) => stmt.tag !== "define" && stmt.tag !== "decl");

  const allStmts = stmts.map(p => codeGenStmt(p, GlobalEnv)).flat();
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
      (import "js" "memory" (memory 1))
      ${allFuns}
      (func (export "_start") ${retType}
        ${ourCode}
        ${retVal}
      )
    ) 
  `};
}
