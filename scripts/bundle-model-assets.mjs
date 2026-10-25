import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';

// Model bytes are immutable build assets, never patient records. Bundle the
// pinned v3 model at its existing URLs so the independent v4 needs no R2 copy.
const manifest=JSON.parse(await readFile(new URL('../lib/gigaam-model-manifest.json',import.meta.url),'utf8'));
const source=process.argv[2];
if(!source)throw Error('Usage: node scripts/bundle-model-assets.mjs VERIFIED_CHUNKS_DIRECTORY');
for(const chunk of manifest.chunks){
 const bytes=await readFile(path.join(source,path.basename(chunk.url)));
 if(bytes.length!==chunk.bytes||createHash('sha256').update(bytes).digest('hex')!==chunk.sha256)throw Error(`Model verification failed: ${path.basename(chunk.url)}`);
 const destination=path.join('public',chunk.url);
 await mkdir(path.dirname(destination),{recursive:true});
 await writeFile(destination,bytes);
}
console.log(`Bundled ${manifest.chunks.length} verified model chunks at their original URLs.`);
