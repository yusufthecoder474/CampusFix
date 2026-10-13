import js from "@eslint/js";
import parser from "@babel/eslint-parser";
import hooks from "eslint-plugin-react-hooks";
import globals from "globals";
export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          plugins: ["@babel/plugin-syntax-jsx"],
          presets: ["@babel/preset-typescript"],
        },
      },
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-undef": "off",
      "no-unused-vars": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      eqeqeq: "error",
    },
  },
  {
    files: ["web/src/**/*.tsx", "web/tests/**/*.tsx"],
    plugins: { "react-hooks": hooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
];
