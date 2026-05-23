import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
    js.configs.recommended,
    ...tseslint.configs.recommended,

    {
        ignores: [
            "**/dist/**",
            "**/build/**",
            "**/.turbo/**",
            "**/.next/**",
            "**/node_modules/**",
            "**/*.config.ts",
            "**/*.config.js"
        ],
    },

    {
        files: ["**/*.ts"],
        // We remove `project: true` here so it doesn't crash on files 
        // that aren't perfectly mapped in a tsconfig.json during setup.
        // You can enable it later once your monorepo tsconfigs are perfectly linked!
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-unused-vars": "warn",
            "@typescript-eslint/consistent-type-imports": "warn",
            "@typescript-eslint/no-unsafe-function-type": "warn",
            "@typescript-eslint/ban-ts-comment": "warn"
        },
    },

    {
        // Tests often need to do "unsafe" things like mock 'any' objects
        files: ["**/__tests__/**/*.ts"],
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-unsafe-function-type": "off",
        }
    }
];