import { statSync } from 'fs';
import wabt from 'wabt';
import {Stmt, Expr} from './ast';
import {parseProgram, traverseExpr} from './parser';

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
  switch(expr.tag) {
    case "id": return [`(local.get $${expr.name})`];
    case "number": return [`(i32.const ${expr.value})`];
    case "call":
      var valStmts = codeGenExpr(expr.arguments[0]);
      valStmts.push(`(call $${expr.name})`);
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
export function compile(source : string) : string {
  const ast = parseProgram(source);
  const vars : Array<string> = [];
  ast.forEach((stmt) => {
    if(stmt.tag === "assign") { vars.push(stmt.name); }
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

  return `
    (module
      ${allFuns}
      (func (export "_start") ${retType}
        ${ourCode}
        ${retVal}
      )
    ) 
  `;
}
