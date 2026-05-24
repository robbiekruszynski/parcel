const appJson = require('./app.json');

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  expo: {
    ...appJson.expo,
    android: {
      ...appJson.expo.android,
      // Google Maps key no longer needed — replaced by Mapbox
      config: {},
    },
    plugins: [
      ...(appJson.expo.plugins ?? []),
      [
        '@rnmapbox/maps',
        {
          // Secret download token (sk.) — only used at build time to pull the
          // native Mapbox SDK from their private Maven / CocoaPods registry.
          // Add MAPBOX_SECRET_TOKEN to EAS secrets (not the public pk. token).
          RNMapboxMapsDownloadToken: process.env.MAPBOX_SECRET_TOKEN ?? '',
        },
      ],
    ],
  },
};
