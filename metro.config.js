const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Apply NativeWind first, then layer our resolver on top.
const nwConfig = withNativeWind(config, { input: './global.css' });

// @rnmapbox/maps ships a web entry that pulls in mapbox-gl (which isn't
// installed). This app is mobile-only — stub any import that comes from the
// rnmapbox web folder so Metro never tries to resolve it.
const upstream = nwConfig.resolver?.resolveRequest;
nwConfig.resolver = nwConfig.resolver ?? {};
nwConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  // Stub the entire @rnmapbox web sub-tree and any stray CSS imports.
  if (
    moduleName.endsWith('.css') ||
    moduleName === 'mapbox-gl' ||
    moduleName.startsWith('mapbox-gl/')
  ) {
    return { type: 'empty' };
  }
  if (upstream) return upstream(context, moduleName, platform);
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = nwConfig;
