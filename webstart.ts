import {compile, run} from './compiler';
import {NONE, TRUE, FALSE} from './ast'

document.addEventListener("DOMContentLoaded", async () => {
  var importObject = {
    imports: {
      print: (arg : any) => {
        console.log("Logging from WASM: ", arg);
        const elt = document.createElement("pre");
        document.getElementById("output").appendChild(elt);
        var num = Number(arg);
        switch(num){
          case NONE:
            elt.innerText = "NONE";
            return arg;
          case TRUE:
            elt.innerText = "True";
            return arg;
          case FALSE:
            elt.innerText = "False";
            return arg;
          default:
            elt.innerText = String(num>>1);
            return arg;
        }
      },
      abs: (arg : bigint) => {
        var num = Number(arg)>>1;
        console.log("Executing abs from WASM: ", num);
        return BigInt(Math.abs(num)<<1|1);
      },
      max: (arg1 : bigint, arg2 : bigint) => {
        var num1 = Number(arg1)>>1;
        var num2 = Number(arg2)>>1;
        console.log("Executing max from WASM: ", num1, num2);
        return BigInt(Math.max(num1, num2)<<1|1);
      },
      min: (arg1 : bigint, arg2 : bigint) => {
        var num1 = Number(arg1)>>1;
        var num2 = Number(arg2)>>1;
        console.log("Executing min from WASM: ", num1, num2);
        return BigInt(Math.min(num1, num2)<<1|1);
      },
      pow: (arg1 : bigint, arg2 : bigint) => {
        var num1 = Number(arg1)>>1;
        var num2 = Number(arg2)>>1;
        console.log("Executing pow from WASM: ", num1, num2);
        return BigInt(Math.pow(num1, num2)<<1|1);
      }
    },
  };

  const runButton = document.getElementById("run");
  const userCode = document.getElementById("user-code") as HTMLTextAreaElement;
  runButton.addEventListener("click", async () => {
    const program = userCode.value;
    const wat = compile(program).wasmSource;
    const code = document.getElementById("generated-code");
    code.textContent = wat;
    const output = document.getElementById("outcome");
    try {
      const result = await run(wat, { importObject });
      output.textContent = String(result);
      output.setAttribute("style", "color: black");
    }
    catch(e) {
      output.textContent = String(e);
      output.setAttribute("style", "color: red");
    }
  });
});