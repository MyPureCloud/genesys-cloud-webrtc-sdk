const path = require('path');

module.exports = {
  target: 'web',
  mode: 'development',
  output: {
    path: path.resolve(__dirname),
    libraryTarget: 'umd'
  },
  devtool: 'source-map',

  resolve: {
    extensions: ['.ts', '.js', '.json']
  },
  module: {
    rules: [
      {
        test: /\.(js|ts)$/,
        exclude: /(node_modules|bower_components|dist)/,
        loader: 'babel-loader',
        query: {
          presets: ['@babel/preset-env', '@babel/preset-typescript'],
          plugins: ['@babel/plugin-proposal-class-properties', '@babel/plugin-transform-runtime']
        }
      }
    ]
  }
};
