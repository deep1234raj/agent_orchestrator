const { FlatCompat } = require("@eslint/eslintrc");
const js = require("@eslint/js");

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

module.exports = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [".next/**", "node_modules/**", "eslint.config.js"],
  },
  {
    rules: {
      // Apostrophes in JSX text are safe in browsers; the rule produces false positives.
      "react/no-unescaped-entities": "off",
      // Allow _-prefixed params/vars to signal intentional non-use.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { varsIgnorePattern: "^_", argsIgnorePattern: "^_" },
      ],
    },
  },
];
