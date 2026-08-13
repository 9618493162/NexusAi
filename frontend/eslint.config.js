import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

/**
 * ESLint 9 flat config — the project's `npm run lint` script referenced this
 * file but it was never created (the repo shipped with ESLint 9 + no config,
 * so lint could never run). Rules mirror the Vite React-TS template defaults.
 * Type-level checks (unused vars, types) are handled by `tsc` (the build runs
 * `tsc && vite build`), so ESLint focuses on runtime/lint concerns.
 */
export default tseslint.config(
  // tailwind.config.js is a CommonJS config file, not TS app code.
  { ignores: ["dist", "node_modules", "tailwind.config.js"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The codebase deliberately uses ref-freshness effect patterns (see the
      // disable directives across ChatMessage/Files/Voice/select); tsc already
      // enforces types, so keep lint focused on real problems.
      "react-hooks/exhaustive-deps": "off",
      // Constants/helpers are intentionally shared from component files.
      "react-refresh/only-export-components": "off",
      // The codebase intentionally uses `any` in API error handling; keep it.
      "@typescript-eslint/no-explicit-any": "off",
      // Unused locals/params are already hard errors in `tsc` (noUnusedLocals).
      "@typescript-eslint/no-unused-vars": "off",
      // Browser globals are type-checked by TS; ESLint's undef is noise here.
      "no-undef": "off",
    },
  }
);
