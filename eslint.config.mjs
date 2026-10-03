import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

/** @type {import("eslint").Linter.Config[]} */
const config = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "npm-install.log",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  // Must come last: disables formatting rules that conflict with Prettier.
  prettier,
];

export default config;
