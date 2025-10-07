import {createRequire} from 'node:module';
import typescript from '@rollup/plugin-typescript';

const require = createRequire(import.meta.url);

const packageJson = require('./package.json');

export default [
  {
    input: 'src/index.ts',
    external: ['react', 'react/jsx-runtime'],
    output: [
      {
        file: packageJson.exports['.'].import,
        format: 'es',
        sourcemap: true,
      },
      {
        file: packageJson.exports['.'].require,
        format: 'cjs',
        sourcemap: true,
      },
    ],
    plugins: [
      typescript({exclude: ['**/__tests__', '**/*.test.ts', '**/*.test.tsx']}),
    ],
  },
  {
    input: 'src/validation.ts',
    external: ['react', 'react/jsx-runtime'],
    output: [
      {
        file: packageJson.exports['./validation'].import,
        format: 'es',
        sourcemap: true,
      },
      {
        file: packageJson.exports['./validation'].require,
        format: 'cjs',
        sourcemap: true,
      },
    ],
    plugins: [
      typescript({exclude: ['**/__tests__', '**/*.test.ts', '**/*.test.tsx']}),
    ],
  },
];
