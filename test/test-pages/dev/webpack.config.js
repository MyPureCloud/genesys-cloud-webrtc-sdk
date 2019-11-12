const path = require('path');

module.exports = {
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
        test: /\.ts$/,
        exclude: /(node_modules|bower_components)/,
        loader: 'awesome-typescript-loader'
      },
      {
        test: /\.js$/,
        exclude: /(node_modules|bower_components|dist)/,
        loader: 'babel-loader',
        query: {
          presets: ['@babel/preset-env'],
          plugins: ['@babel/plugin-transform-runtime']
        }
      }
    ]
  }
};
