// @ts-check

/* eslint-env node, es2022 */

import {esbuildPlugin} from '@web/dev-server-esbuild';
import {playwrightLauncher} from '@web/test-runner-playwright';

const chromium = playwrightLauncher({product: 'chromium'});
const webkit = playwrightLauncher({product: 'webkit'});
const firefox = playwrightLauncher({product: 'firefox'});

process.env.NODE_ENV = 'test';

/** @type {import('@web/test-runner').TestRunnerConfig} */
const config = {
  nodeResolve: true,
  plugins: [
    esbuildPlugin({
      ts: true,
      tsx: true,
      target: 'es2022',
      define: {
        'process.env.NODE_ENV': '"test"',
      },
    }),
  ],
  testFramework: {
    config: {
      ui: 'tdd',
      reporter: 'html',
    },
  },
  files: ['src/**/*.test.tsx'],
  browsers: [firefox, chromium, webkit],
};

export default config;
