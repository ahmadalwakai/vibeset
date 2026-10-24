const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Shared schemas/DTOs are source files; native React must resolve from this app.
config.watchFolders = [path.resolve(__dirname, '../lib')];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(__dirname, 'node_modules/expo/node_modules'),
];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const nativeDependency = ['react', 'react-native', 'zod'].some(
    (name) => moduleName === name || moduleName.startsWith(`${name}/`),
  );
  return context.resolveRequest(
    nativeDependency ? { ...context, originModulePath: path.join(__dirname, 'index.ts') } : context,
    moduleName,
    platform,
  );
};
module.exports = config;
