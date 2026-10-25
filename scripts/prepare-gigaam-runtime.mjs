import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

// Generated model assets are excluded from Git, like the browser WASM runtime.
// The manifest pins every byte. Fresh checkouts restore the published version;
// the initial publish is prepared from the reproducible official-weight export.
const manifest=JSON.parse(await readFile(new URL('../lib/gigaam-model-manifest.json',import.meta.url),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const args=process.argv.slice(2);
if(args.length&&(args.length!==2||args[0]!=='--from-onnx'))throw Error('Usage: node scripts/prepare-gigaam-runtime.mjs [--from-onnx FILE]');
const exported=args.length?await readFile(args[1]):null;
if(exported&&(exported.length!==manifest.bytes||sha(exported)!==manifest.sha256))throw Error('Unexpected model export: byte length or SHA-256 differs.');
let offset=0;
for(const chunk of manifest.chunks){
  const destination=path.join('public',chunk.url);
  let bytes=exported?.subarray(offset,offset+chunk.bytes);offset+=chunk.bytes;
  if(!bytes)try{bytes=await readFile(destination);}catch{
    const response=await fetch('https://clinical-compass-v3.feyzebra.chatgpt.site'+chunk.url,{signal:AbortSignal.timeout(120000)});
    if(!response.ok)throw Error('Model assets unavailable. Prepare the official export with --from-onnx; see docs/VOICE_AND_MAP.md.');
    bytes=Buffer.from(await response.arrayBuffer());
  }
  if(bytes.length!==chunk.bytes||sha(bytes)!==chunk.sha256)throw Error(`Model chunk verification failed: ${chunk.url}`);
  await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,bytes);
}
if(offset!==manifest.bytes)throw Error('Invalid model manifest.');
console.log('GigaAM browser assets verified against pinned hashes. Weights are build output, excluded from Git.');
