import { TreeCursor } from 'lezer';
import {parser} from 'lezer-python';
import {Parameter, Stmt, Expr, Type, Decl, Op} from './ast';

export function parseProgram(source : string) : Array<Stmt> {
  const t = parser.parse(source).cursor();
  return traverseStmts(source, t);
}

export function traverseStmts(s : string, t : TreeCursor) {
  // The top node in the program is a Script node with a list of children
  // that are various statements
  t.firstChild();
  const stmts = [];
  do {
    stmts.push(traverseStmt(s, t));
  } while(t.nextSibling()); // t.nextSibling() returns false when it reaches
                            //  the end of the list of children
  return stmts;
}

/*
  Invariant – t must focus on the same node at the end of the traversal
*/
export function traverseStmt(s : string, t : TreeCursor) : Stmt {
  console.log("stmt type is:" + t.type.name)
  switch(t.type.name) {
    case "ReturnStatement":
      t.firstChild();  // Focus return keyword
      var value:Expr = { tag:"none" };
      t.nextSibling() // Focus expression
      if(s.substring(t.from, t.to).length > 0) value = traverseExpr(s, t); // non empty return statement
      t.parent();
      return { tag: "return", value };
    case "PassStatement":
      return { tag: "pass" };
    case "AssignStatement":
      t.firstChild(); // focused on name (the first child)
      var name = s.substring(t.from, t.to);

      t.nextSibling(); // ;Type
      var isDecl:boolean = (s.substring(t.from, t.to) != "=");

      if(isDecl) {
        t.firstChild(); // Focus on :
        t.nextSibling();
        var tp = Type.None;
        switch(s.substring(t.from, t.to))
        {
          case "int":
            tp = Type.Int
            break;
          case "bool":
            tp = Type.Bool
            break;
          default:
            throw new Error("Invalid type annotation; there is no class named: " + retType)
        }
        t.parent();

        t.nextSibling(); // focused on = sign. May need this for complex tasks, like +=!
        t.nextSibling(); // focused on the value expression

        var value = traverseExpr(s, t);
        t.parent();
        //TODO: Type check
        var decl:Decl = { tag: "init", name: name, type: tp, value: value }
        return { tag: "decl", decl: decl };

      }

      t.nextSibling(); // focused on = sign. May need this for complex tasks, like +=!
      t.nextSibling(); // focused on the value expression

      var value = traverseExpr(s, t);
      t.parent();
      return { tag: "assign", name, value };
    case "ExpressionStatement":
      t.firstChild(); // The child is some kind of expression, the
                      // ExpressionStatement is just a wrapper with no information
      var expr = traverseExpr(s, t);
      t.parent();
      return { tag: "expr", expr: expr };
    case "IfStatement":
      //tempararily ignore elif
      t.firstChild(); // Focuse on if
      t.nextSibling(); // cond

      var cond = traverseExpr(s,t);
      t.nextSibling();

      t.firstChild(); // Focus on :
      t.nextSibling(); // Focus on thn body

      var body:Stmt[] = []
      do {
        console.log(s.substring(t.from, t.to));
        var stmt  = traverseStmt(s, t);
        body.push(stmt);
      } while(t.nextSibling()) // t.nextSibling() returns false when it reaches

      t.parent(); // back to IfStatement
      t.nextSibling();

      t.firstChild(); // Focus on else part
      if(s.substring(t.from, t.to) == ":") {
        t.parent();// Pop to the IfStatement
        t.parent();// Pop of IfStatement
        return { tag: "if", cond: cond, thn: body, els: [ { tag: "pass" } ] };
      }

      t.nextSibling(); // Focus on : els

      t.firstChild(); // Focus on :
      t.nextSibling(); //Focus on first statement in els
      var els:Stmt[] = []
      do {
        var stmt  = traverseStmt(s, t);
        els.push(stmt);
      } while(t.nextSibling()); // t.nextSibling() returns false when it reaches

      t.parent(); // Pop to : els
      t.parent(); // Pop to Body

      t.parent(); // Pop to IfStatement
      return { tag: "if", cond: cond, thn: body, els: els };
    case "WhileStatement":
      t.firstChild(); // Focuse on while
      t.nextSibling(); // cond

      var cond = traverseExpr(s,t);
      t.nextSibling();

      t.firstChild(); // Focus on :
      t.nextSibling(); // Focus on thn body

      var body:Stmt[] = []
      do {
        console.log(s.substring(t.from, t.to));
        var stmt  = traverseStmt(s, t);
        body.push(stmt);
      } while(t.nextSibling()) // t.nextSibling() returns false when it reaches

      t.parent(); // Pop of body
      t.parent(); // Pop of WhileStatement

      return { tag: "while", cond: cond, body: body };
    case "FunctionDefinition":
      t.firstChild();  // Focus on def
      t.nextSibling(); // Focus on name of function
      var name = s.substring(t.from, t.to);
      t.nextSibling(); // Focus on ParamList
      var parameters = traverseParameters(s, t)

      // If have return
      t.nextSibling(); // Focus on ->Type or Body
      t.firstChild(); // Focus on -> or :
      var hasReturn:boolean = (s.substring(t.from, t.to) != ":");
      var ret:Type = Type.None;
      if (hasReturn) {
        t.nextSibling(); // Focus on Type
        var retType = s.substring(t.from, t.to);
        switch(retType){
          case "int":
            ret = Type.Int
            break;
          case "bool":
            ret = Type.Bool
            break;
          default:
            throw new Error("Invalid type annotation; there is no class named: " + retType)
        }

        t.parent();
        t.nextSibling(); // Focus on Body
        t.firstChild();  // Focus on :
      }
      
      t.nextSibling(); // Focus on single statement (for now)
      var decls:Decl[] = [];
      var body:Stmt[] = [];
      var finishDecls = false; // Make sure decls are at the beginning.
      do {
        var stmt  = traverseStmt(s, t);
        if (stmt.tag == "decl") {
          if(finishDecls) throw new Error("Parse error because of unappropriate declarations.")
          decls.push(stmt.decl);
        } else {
          if(!finishDecls) finishDecls = true;
          body.push(stmt);
        }
      } while(t.nextSibling()); // t.nextSibling() returns false when it reaches

      // TODO: Type check
      t.parent();      // Pop to Body
      t.parent();      // Pop to FunctionDefinition
      return {
        tag: "define",
        name, parameters, ret, decls, body
      }
  }
}

export function traverseParameters(s : string, t : TreeCursor) : Array<Parameter> {
  t.firstChild();  // Focuses on open paren
  var parameters:Array<Parameter> = [];
  // Add all parameters
  while (t.nextSibling()) {  // Focuses on a VariableName
    let name = s.substring(t.from, t.to);
    if(name == ")") break; // Focuses on close paren

    t.nextSibling(); // :Type
    t.firstChild(); // :
    t.nextSibling(); // Type
    let tp = s.substring(t.from, t.to);
    t.parent();

    switch(tp){
      case "int":
        parameters.push({ name: name,  type: Type.Int})
        break;
      case "bool":
        parameters.push({ name: name,  type: Type.Bool})
        break;
      default:
        throw new Error("Invalid type annotation; there is no class named: " + tp)
    }
    t.nextSibling(); // , | )
  }
  t.parent();      // Pop to ParamList
  return parameters;
}

export function traverseExpr(s : string, t : TreeCursor) : Expr {
  switch(t.type.name) {
    case "Number":
      return { tag: "num", value: Number(s.substring(t.from, t.to)) };
    case "Boolean":
      return { tag: "bool", value: s.substring(t.from, t.to)=="True" };
    case "None":
      return { tag: "none" }
    case "VariableName":
      return { tag: "id", name: s.substring(t.from, t.to) };
    case "UnaryExpression": 
      t.firstChild();
      const sign = s.substring(t.from, t.to);
      var op:Op = null;
      switch(sign) {
        case "-":
          op = Op.Neg;
          break;
        case "not":
          op = Op.Not;
          break;
        default:
          throw new Error("Unsupported unaryExpresssion");
      }

      t.nextSibling();
      var arg = traverseExpr(s, t);
      t.parent();
      return {
        tag: "uop",
        op: op,
        arg: arg
      }
    case "BinaryExpression":
      t.firstChild();
      const left = traverseExpr(s, t);

      t.nextSibling();
      const opr = s.substring(t.from, t.to);
      var op:Op = null;
      switch(opr) {
        case "+":
          op = Op.Plus;
          break;
        case "-":
          op = Op.Minus;
          break;
        case "*":
          op = Op.Times;
          break;
        case "//":
          op = Op.Div;
          break;
        case "%":
          op = Op.Mod;
          break;
        case "==":
          op = Op.Eq;
          break;
        case "!=":
          op = Op.Neq;
          break;
        case "<=":
          op = Op.Leq;
          break;
        case ">=":
          op = Op.Geq;
          break;
        case "<":
          op = Op.Lt;
          break;
        case ">":
          op = Op.Gt;
          break;
        case "is":
          op = Op.Is;
          break;
        default:
          throw new Error("Invalid BinaryOperator")
      }
    
      t.nextSibling();
      const right = traverseExpr(s, t);
      t.parent();
      return {
        tag: "op",
        op: op,
        left: left,
        right: right
      };
    case "CallExpression":
      t.firstChild(); // Focus name
      const callName = s.substring(t.from, t.to);
      t.nextSibling(); // Focus ArgList
      t.firstChild(); // Focus open paren
      switch(callName){
        case "print":
        case "abs":
          t.nextSibling();
          const arg = traverseExpr(s, t);
          t.parent(); // pop arglist
          t.parent(); // pop CallExpression

          return {
            tag: "builtin1",
            name: callName,
            arg: arg
          };
        case "max":
        case "min":
        case "pow":
          t.nextSibling();
          const arg1 = traverseExpr(s, t);
          t.nextSibling(); // skip comma
          t.nextSibling();
          const arg2 = traverseExpr(s, t);
          t.parent(); // pop arglist
          t.parent(); // pop CallExpression

          return {
            tag: "builtin2",
            name: callName,
            left: arg1,
            right: arg2
          };
        default:
          var args:Array<Expr> = [];
          // Add all parameters
          while (t.nextSibling()) {  // Focuses on an Expr
            let name = s.substring(t.from, t.to);
            if(name == ")") break; // Focuses on close paren
        
          
            var value = traverseExpr(s, t);
            args.push(value);
            t.nextSibling(); // , | )
          }
          var result : Expr = { tag: "call", name: callName, arguments: args};
          t.parent();
          t.parent();
          return result;
      }
  }
}