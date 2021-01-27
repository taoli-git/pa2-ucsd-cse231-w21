import { throws } from 'assert';
import {Stmt, Expr, Decl, Type, Op} from './ast';

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
            return Type.Bool;
    }
}

export function tcExpr(expr : Expr) : Type {
    switch(expr.tag) {
        case "none":
            return Type.None;
        case "bool":
            return Type.Bool;
        case "num":
            return Type.Int;
        case "uop":
            let tp = tcExpr(expr.arg);
            return checkUOp(expr.op, tp);
        case "op":
            let leftType = tcExpr(expr.left);
            let rightType = tcExpr(expr.right);
            return checkOp(expr.op, leftType, rightType)
        case "builtin1":
        case "builtin2":
        case "call":
            break;
    }
//   | { tag: "builtin1", name: string, arg: Expr }
//   | { tag: "builtin2", name: string, left: Expr, right: Expr }
//   | { tag: "call", name: string, arguments: Array<Expr> }
}