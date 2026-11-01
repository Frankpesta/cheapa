import { createConfig } from '@cheapa/config/eslint';

export default createConfig({ tsconfigRootDir: import.meta.dirname, restrictUsersDb: true });
