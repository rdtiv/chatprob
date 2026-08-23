import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'

const eslintConfig = defineConfig([
  ...nextVitals,
  {
    // Existing effects in these files trip the Next 16 react-hooks rule.
    // New files stay covered.
    files: [
      'components/ChatInterface.js',
      'components/SamplingPanel.js',
      'components/TokenProbabilities.js',
    ],
    rules: {
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  globalIgnores([
    '**/.next/**',
    '**/out/**',
    '**/build/**',
    '**/next-env.d.ts',
    '.claude/**',
    '.grok/**',
  ]),
])

export default eslintConfig
