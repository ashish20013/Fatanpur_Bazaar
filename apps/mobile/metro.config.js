const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('node:path');

// `@fb/shared-types` lives outside apps/mobile (npm workspaces layout) — Metro must be told
// to follow the symlink/relative package and to resolve its single copy of node_modules.
const sharedTypesRoot = path.resolve(__dirname, '../../packages/shared-types');
const projectRoot = __dirname;
const workspaceRoot = path.resolve(__dirname, '../..');

/** @type {import('metro-config').MetroConfig} */
const config = {
  watchFolders: [sharedTypesRoot, workspaceRoot],
  resolver: {
    nodeModulesPaths: [path.resolve(projectRoot, 'node_modules'), path.resolve(workspaceRoot, 'node_modules')],
    disableHierarchicalLookup: false,
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
