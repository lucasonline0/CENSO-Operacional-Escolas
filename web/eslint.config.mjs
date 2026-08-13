import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

     /* 
     Arquivos antigos ignorados para a task atual. 
     Eu não quero refatorar um monte de coisa e fazer merda no front 
     */
    "src/components/admin/Aba*.tsx",
    "src/components/admin/PresentationMode.tsx",
    "src/components/admin/RankingGovernancaTable.tsx",

  ]),
]);

export default eslintConfig;
