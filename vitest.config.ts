import {playwright} from '@vitest/browser-playwright';
import {defineConfig} from 'vitest/config';

export default defineConfig({
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-dom/client'],
  },
  test: {
    exclude: ['out/**', 'node_modules/**'],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [
        {browser: 'chromium'},
        {browser: 'firefox'},
        {browser: 'webkit'},
      ],
    },
  },
});
