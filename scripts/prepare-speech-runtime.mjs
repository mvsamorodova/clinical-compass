import {createRequire} from 'node:module';
import {mkdirSync,copyFileSync} from 'node:fs';
import path from 'node:path';
const require=createRequire(import.meta.url);
const transformerRequire=createRequire(require.resolve('@huggingface/transformers'));
const runtime=path.dirname(transformerRequire.resolve('onnxruntime-web/wasm'));
const destination=path.resolve('public/speech-runtime');mkdirSync(destination,{recursive:true});
for(const name of ['ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm','ort-wasm-simd-threaded.jsep.mjs','ort-wasm-simd-threaded.jsep.wasm'])copyFileSync(path.join(runtime,name),path.join(destination,name));
console.log('Speech runtime assets prepared. Model weights load only after the user chooses to download.');
