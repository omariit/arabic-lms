import { FlatCompat } from "@eslint/eslintrc";

/**
 * ESLint flat config (H5): Next.js core-web-vitals as the base. The build no longer
 * silently skips linting (`eslint.ignoreDuringBuilds` stays, but `npm run lint` and
 * CI run it as a blocking gate). Rules beyond the preset are kept minimal: only what
 * protects real production incidents this project actually had.
 */
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [
  { ignores: [".next/**", "node_modules/**", "recording-service/**", "public/pdf.worker.min.mjs", "tests/e2e/.qa-state.json"] },
  ...compat.extends("next/core-web-vitals"),
  {
    rules: {
      // Client fetches must never surface a raw crash screen: `catch {}` with an Arabic
      // message + retry is the intended pattern, so allow explicit empty catches.
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
];
