import {compile, run} from './compiler';

// command to run:
// node node-main.js 987
const input = process.argv[2];
const result = compile(input).wasmSource;
console.log(result);
run(result).then((value) => {
  console.log(value);
});

