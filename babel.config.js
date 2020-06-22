module.exports = {
  // runtimeHelpers: true,
  presets: [
    ['@babel/preset-env', {
      // useBuiltIns: 'usage',
      // corejs: 3,
      debug: true,
      targets: [
        'last 2 versions',
        '> 5%',
        'IE 11',
        'not dead'
      ]
    }]
  ],
  plugins: [
    ['@babel/plugin-transform-runtime', {
      corejs: 3
    }],
    '@babel/plugin-transform-regenerator',
    '@babel/plugin-proposal-async-generator-functions'
  ]
};
