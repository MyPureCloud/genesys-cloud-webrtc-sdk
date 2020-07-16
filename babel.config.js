module.exports = (api) => {
  console.log('Babel is running in mode:', api.env());

  return {
    presets: [
      ['@babel/preset-env', {
        debug: false,
        targets: [
          'last 2 versions',
          '> 5%',
          'IE 11',
          'not dead'
        ]
      }],
      '@babel/preset-typescript'
    ],
    plugins: [
      ['@babel/plugin-transform-runtime', {
        /* if we are testing, we don't want core-js polyfills */
        corejs: api.env() === 'test' ? false : 3
      }],
      '@babel/plugin-proposal-class-properties'
    ]
  };
};
