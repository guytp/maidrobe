module.exports = function (api) {
  const isTest = api.env('test');
  api.cache(true);

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      !isTest && [
        'module:react-native-dotenv',
        {
          moduleName: '@env',
          path: '.env',
          blacklist: null,
          whitelist: null,
          safe: false,
          allowUndefined: true,
        },
      ],
    ].filter(Boolean),
  };
};
