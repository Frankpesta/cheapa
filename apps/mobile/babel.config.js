// NativeWind 4: JSX runtime + className transform (nativewind.dev/docs/getting-started/installation).
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
