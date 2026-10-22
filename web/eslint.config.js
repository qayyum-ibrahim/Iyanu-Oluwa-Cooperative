import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["node_modules/", "dist/", "coverage/"] },
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
);
