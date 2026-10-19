import vinext from 'vinext';
import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  server: { host: '127.0.0.1' },
  plugins: [
    vinext(),
    cloudflare({
      configPath: './wrangler.jsonc',
      viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
      persistState: { path: '.wrangler/state' },
      inspectorPort: false,
    }),
  ],
});
