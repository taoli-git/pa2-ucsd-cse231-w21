import {compile, run} from './compiler';
import {NONE, TRUE, FALSE} from './ast'

const importObject = {
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
    abs: (arg : number) => {
      console.log("Executing abs from WASM: ", arg);
      return Math.abs(arg)>>1;
    },
    max: (arg1 : number, arg2 : number) => {
      console.log("Executing max from WASM: ", arg1, arg2);
      return Math.max(arg1, arg2)>>1;
    },
    min: (arg1 : number, arg2 : number) => {
      console.log("Executing min from WASM: ", arg1, arg2);
      return Math.min(arg1, arg2)>>1;
    },
    pow: (arg1 : number, arg2 : number) => {
      console.log("Executing pow from WASM: ", arg1, arg2);
      return Math.pow(arg1, arg2)>>1;
    }
  },
};

// command to run:
// node node-main.js 987
const input = process.argv[2];
const result = compile(input).wasmSource;
console.log(result);
run(result, { importObject }).then((value) => {
  console.log(value);
});

