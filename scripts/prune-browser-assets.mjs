import { readdir, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';

// Vinext emits browser worker/ONNX assets in the RSC and SSR bundles as well.
// They are referenced by public URLs and must be served from client assets,
// not uploaded as executable Cloudflare Worker modules.
const client = 'dist/client/_next/static';
let removed = 0;
for (const directory of ['dist/server/_next/static', 'dist/server/ssr/_next/static']) {
  for (const file of await readdir(directory)) {
    if (!/^(?:speech|emotion|health-import|llm)\.worker-.*\.js$|^ort-wasm-.*\.wasm$/.test(file)) continue;
    const serverPath = path.join(directory, file);
    const [serverBytes, clientBytes] = await Promise.all([readFile(serverPath), readFile(path.join(client, file))]);
    if (!serverBytes.equals(clientBytes)) throw Error(`Browser asset differs between builds: ${file}`);
    await unlink(serverPath);
    removed++;
  }
}
console.log(`Removed ${removed} duplicate browser assets from server modules; client assets preserved.`);
