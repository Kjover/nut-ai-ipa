const { getDefaultConfig } = require('expo/metro-config')
const path = require('node:path')
const fs = require('node:fs')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// Watch the whole workspace so edits to packages/* hot-reload in the app.
config.watchFolders = [workspaceRoot]

// The bundled nutrition corpus is a binary asset, not source. Without this Metro
// refuses to resolve `require('../../assets/nutrition.db')` and the app ships
// with an empty database that answers every query with zero rows.
config.resolver.assetExts = [...config.resolver.assetExts, 'db']

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]
config.resolver.disableHierarchicalLookup = true

/**
 * Resolve TypeScript's `.js` extension convention from TypeScript SOURCE.
 *
 * `packages/*` are authored as ESM with explicit `./foo.js` specifiers, which is
 * what Node requires when those packages are consumed from their built `dist/`
 * output — and the eval harness consumes them exactly that way.
 *
 * `tsc` and Vitest both understand that `./foo.js` means `./foo.ts` when reading
 * source. Metro does not: it takes the specifier literally, finds no `bands.js`
 * next to `bands.ts`, and fails.
 *
 * Rather than dropping the extensions (which would break the Node build) or
 * forcing the app to consume `dist/` (which would break hot reload and mean the
 * app runs different bytes from the harness), rewrite the specifier here. This is
 * the only place the two conventions have to meet.
 */
const originalResolveRequest = config.resolver.resolveRequest

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const isRelative = moduleName.startsWith('./') || moduleName.startsWith('../')

  if (isRelative && moduleName.endsWith('.js')) {
    const originDir = path.dirname(context.originModulePath)
    // Only rewrite when a sibling .ts actually exists, so a genuine .js file in
    // node_modules keeps resolving normally.
    const asTs = path.resolve(originDir, moduleName.replace(/\.js$/, '.ts'))
    if (fs.existsSync(asTs)) {
      moduleName = moduleName.replace(/\.js$/, '')
    }
  }

  return originalResolveRequest
    ? originalResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform)
}

module.exports = config
