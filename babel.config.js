/**
 * This config is needed for babel-jest
 * The webpack build uses its own config
 */
module.exports = {
  sourceType: 'unambiguous',
  presets: [
    '@babel/preset-env'
  ],
  plugins: [
    ['@babel/plugin-transform-runtime', {
      /* if we are testing, we don't want core-js polyfills */
      corejs: false
    }],
    '@babel/plugin-proposal-class-properties',
    '@babel/plugin-transform-private-methods'
  ]
};
