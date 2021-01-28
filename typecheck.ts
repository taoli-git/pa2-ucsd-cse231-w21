import { stdin } from 'process';
import {Stmt, Expr, Decl, Type, Op} from './ast';
import { Env } from './compiler';

const types:string[] = [ '<None>', "bool", "int" ];

function checkUOp(op : Op, arg : Type) : Type {
    switch(op) {
        case Op.Neg:
            if (arg!=Type.Int) throw new Error("Cannot apply unary operator '-' on types bool");
            return Type.Int;
        case Op.Not:
            if (arg!=Type.Bool) throw new Error("Cannot apply unary operator 'not' on types int");
            return Type.Bool;
    }
}

function checkOp(op : Op, lt : Type, rt : Type) : Type {
    switch(op) {
        case Op.Plus:
            if (lt!=Type.Int || rt!=Type.Int) throw new Error("Cannot apply operator '+' on types bool");
            return Type.Int;
        case Op.Minus:
            if (lt!=Type.Int || rt!=Type.Int) throw new Error("Cannot apply operator '-' on types bool");
            return Type.Int;
        case Op.Times:
            if (lt!=Type.Int || rt!=Type.Int) throw new Error("Cannot apply operator '*' on types bool");
            return Type.Int;
        case Op.Div:
            if (lt!=Type.Int || rt!=Type.Int) throw new Error("Cannot apply operator '//' on types bool");
            return Type.Int; 
        case Op.Mod:
            if (lt!=Type.Int || rt!=Type.Int) throw new Error("Cannot apply operator '%' on types bool");
            return Type.Int;
        case Op.Eq:
            if (lt!=rt) throw new Error("Cannot apply operator '==' on different types");
            return Type.Bool;
        case Op.Neq:
            if (lt!=rt) throw new Error("Cannot apply operator '!=' on different types");
            return Type.Bool;
        case Op.Leq:
            if (lt!=Type.Int || rt!=Type.Int) throw new Error("Cannot apply operator '<=' on types bool");
            return Type.Bool;
        case Op.Geq:
            if (lt!=Type.Int || rt!=Type.Int) throw new Error("Cannot apply operator '>=' on types bool");
            return Type.Bool;
        case Op.Lt:
            if (lt!=Type.Int || rt!=Type.Int) throw new Error("Cannot apply operator '<' on types bool");
            return Type.Bool;
        case Op.Gt:
            if (lt!=Type.Int || rt!=Type.Int) throw new Error("Cannot apply operator '>' on types bool");
            return Type.Bool;
        case Op.Is:
            if (lt!=Type.None || rt!=Type.None) throw new Error("Cannot apply operator 'is' on types" + types[lt] + "and " + types[rt]);
            return Type.Bool;
    }
}

export function tcExpr(expr : Expr, env : Env) : Type {
    switch(expr.tag) {
        case "none":
            return Type.None;
        case "bool":
            return Type.Bool;
        case "num":
            return Type.Int;
        case "id":
            if(!env.types.has(expr.name)) { console.log("Could not find " + expr.name + " in ", env); throw new Error("Could not find name " + expr.name); }
            return env.types.get(expr.name);
        case "uop":
            let tp = tcExpr(expr.arg, env);
            return checkUOp(expr.op, tp);
        case "op":
            let leftType = tcExpr(expr.left, env);
            let rightType = tcExpr(expr.right, env);
            return checkOp(expr.op, leftType, rightType)
        case "builtin1":
            tcExpr(expr.arg, env);
            return Type.Int;
        case "builtin2":
            let tb21 = tcExpr(expr.left, env);
            let tb22 = tcExpr(expr.left, env);
            if (tb21 != Type.Int) throw new Error("Expected type Int; get type bool in parameter 0");
            if (tb22 != Type.Int) throw new Error("Expected type Int; get type bool in parameter 1");
            return Type.Int;
        case "call":
            var callname = expr.name;
            if(!env.funcInfo.parameters.has(callname)) throw new Error("Not a function or class: " + callname);

            // check parameter types
            var pt = env.funcInfo.parameters.get(callname);
            if(expr.arguments.length != pt.length) throw new Error("Expected " + pt.length + " arguments; got " + expr.arguments.length );
            for (let index = 0; index < pt.length; index++) {
                var argType = tcExpr(expr.arguments[index], env);
                if ( argType != pt[index]) {
                    throw new Error("Expected type " + types[pt[index]] + " ; got type" + types[argType] +" in parameter " + index );
                }
            }
            return env.funcInfo.returnType.get(callname);
    }
}


// check each stmt, expr op decl before codegenExpr etc.
export function tcDecl(decl : Decl, env : Env) : Type {
    if(env.local.has(decl.name)) throw new Error("Duplicate decalaration of identifier in the same scope: " + decl.name);
    env.local.set(decl.name, true);
    env.types.set(decl.name, decl.type);
    return Type.None;
}

// check func return type with its body in define
export function tcStmt(stmt : Stmt, env : Env) : Type {
    switch(stmt.tag) {
        case "assign":
            if(!env.types.has(stmt.name)) { console.log("Could not find " + stmt.name + " in ", env); throw new Error("Not a variable: " + stmt.name); }
            if(!env.local.has(stmt.name)) throw new Error("Cannot assign to variable that is not explicitly declared in this scope: " + stmt.name);
            var vType = tcExpr(stmt.value, env);
            if (env.types.get(stmt.name) != vType) {
                throw new Error("Expected type " + env.types.get(stmt.name) + " ; got type" + vType);
            }
            return Type.None;
        case "decl":
            return tcDecl(stmt.decl, env);
        case "define":
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

            stmt.parameters.forEach(p => {
                if(newEnv.local.has(p.name)) throw new Error("Duplicate decalaration of identifier in the same scope: " + p.name);
                newEnv.local.set(p.name, true);
                newEnv.types.set(p.name, p.type);
            })
            stmt.decls.forEach(element => {
                tcDecl(element, newEnv);
            });
            var rettypes:Type[] = [];
            // handle if statement
            stmt.body.forEach(element => {
                var tp = tcStmt(element, newEnv);
                if (tp!=Type.None) rettypes.push(tp);
            });
            if (stmt.ret==Type.None && rettypes.length>0) throw new Error("Expected type <None>; got type " + types[rettypes[rettypes.length-1]]);
            if (stmt.ret!=Type.None && (stmt.body.length==0 || stmt.body[stmt.body.length-1].tag!="return")) {
                throw new Error("All paths in this function/method must have a return statement: " + stmt.name);
            }
            rettypes.forEach(element => {
                if(element!=stmt.ret) throw new Error("Expected type " + types[stmt.ret] +"; got type " + types[element]);
            });
            return stmt.ret;
        case "return":
            return tcExpr(stmt.value, env);
        case "if":
            var cdtp:Type = tcExpr(stmt.cond, env);
            if (cdtp != Type.Bool) throw new Error("Condition expression cannot be of type " + types[cdtp]);

            var rettypes1:Type[] = [];
            // handle if statement
            stmt.thn.forEach(element => {
                var tp = tcStmt(element, env);
                if (tp!=Type.None) rettypes1.push(tp);
                if (rettypes1.length>0 && tp!=rettypes1[0]) throw new Error("Cannot return different types within on If Block")
            });
            var rettypes2:Type[] = [];
            stmt.els.forEach(element => {
                var tp = tcStmt(element, env);
                if (tp!=Type.None) rettypes2.push(tp);
                if (rettypes2.length>0 && tp!=rettypes2[0]) throw new Error("Cannot return different types within on If Block")
            });

            var rt1 = Type.None;
            if (rettypes1.length > 0) rt1 = rettypes1[0];
            var rt2 = Type.None;
            if (rettypes1.length > 0) rt2 = rettypes1[0];
            if (rt1 != rt2) {
                throw new Error("Cannot return different types within on If Block");
            }
            return rt1;
        case "while":
            var cdtp:Type = tcExpr(stmt.cond, env);
            if (cdtp != Type.Bool) throw new Error("Condition expression cannot be of type " + types[cdtp]);
            
            var rettypes:Type[] = [];
            // handle if statement
            stmt.body.forEach(element => {
                var tp = tcStmt(element, env);
                if (tp!=Type.None) rettypes.push(tp);
                if (rettypes.length>0 && tp!=rettypes[0]) throw new Error("Cannot return different types within on If Block")
            });
            var rt = Type.None;
            if (rettypes.length > 0) rt = rettypes1[0];
            return rt;
        case "expr":
            tcExpr(stmt.expr, env);
            return Type.None;
        case "pass":
            return Type.None;
    }
}

export function tcProg(ast : Array<Stmt>, env : Env) {
    // Add funcInfo
    ast.forEach(stmt => {
        if(stmt.tag === "define") { 
            var types:Type[] = [];
            stmt.parameters.forEach(element => {
                types.push(element.type);
            });
            env.funcInfo.parameters.set(stmt.name, types);
            env.funcInfo.returnType.set(stmt.name, stmt.ret);
        }
    });
    // Add global variable info
    ast.forEach((stmt) => {
        if(stmt.tag === "decl") { tcDecl(stmt.decl, env); }
    });
    const stmts = ast.filter((stmt) => stmt.tag !== "define" && stmt.tag !== "decl");
    stmts.map(p => tcStmt(p, env));
}