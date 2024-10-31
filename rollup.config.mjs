import typescript from '@rollup/plugin-typescript';

import packageJson from './package.json' assert {type: 'json'};

export default [
  {
    input: 'src/index.ts',
    external: ['react'],
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
    plugins: [typescript({exclude: ['**/__tests__', '**/*.test.ts']})],
  },
  {
    input: 'src/validation.ts',
    external: ['react'],
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
    plugins: [typescript({exclude: ['**/__tests__', '**/*.test.ts']})],
  },
];
