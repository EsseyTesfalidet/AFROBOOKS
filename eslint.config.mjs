import nextVitals from 'eslint-config-next/core-web-vitals';

const config = [
  ...nextVitals,
  { ignores: ['.next/**', '.firebase/**', '.vercel/**', '.git/**', '**/node_modules/**', 'functions/lib/**', 'dist/**', 'public/sw.js', 'public/workbox-*.js', 'public/worker-*.js'] },
  // React Compiler is not enabled here. Surface its migration diagnostics without
  // blocking the existing app; rules-of-hooks and other correctness rules remain errors.
  { rules: {
    'react-hooks/set-state-in-effect': 'warn',
    'react-hooks/refs': 'warn',
    'react-hooks/static-components': 'warn',
    'react-hooks/purity': 'warn',
    'react-hooks/preserve-manual-memoization': 'warn',
    'react/no-unescaped-entities': 'warn',
  } },
];

export default config;
