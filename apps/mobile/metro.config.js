// Expo's default config already handles the pnpm monorepo (watch folders, symlinks).
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Workspace packages (@cheapa/core, @cheapa/config) ship TypeScript source behind the
// "@cheapa/source" export condition, and import siblings as "./x.js" (NodeNext style).
config.resolver.unstable_conditionNames = [
  '@cheapa/source',
  ...(config.resolver.unstable_conditionNames ?? ['require', 'import', 'react-native']),
];
const resolveDefault = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = resolveDefault ?? context.resolveRequest;
  const fromWorkspace = /[/\\]packages[/\\][^/\\]+[/\\]/.test(context.originModulePath);
  if (fromWorkspace && moduleName.startsWith('.') && moduleName.endsWith('.js')) {
    try {
      return resolve(context, moduleName.slice(0, -3) + '.ts', platform);
    } catch {
      // Not a .ts sibling: fall through to the real .js file.
    }
  }
  return resolve(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
