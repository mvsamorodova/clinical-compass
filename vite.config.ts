import vinext from 'vinext';
import { sites } from './build/sites-vite-plugin';
import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  server: { host: '127.0.0.1' },
  plugins: [
    vinext(),
    sites({ mockAuth: false }),
    cloudflare({
      configPath: './wrangler.jsonc',
      viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
      persistState: { path: '.wrangler/state' },
      inspectorPort: false,
    }),
  ],
});
