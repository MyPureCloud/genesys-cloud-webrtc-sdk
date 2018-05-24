const path = require('path');

module.exports = {
  entry: './src/client.js',
  mode: 'production',
  output: {
    path: path.resolve(__dirname, 'web'),
    filename: 'pc-streaming-client.js',
    library: 'pc-streaming',
    libraryTarget: 'umd'
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /(node_modules|bower_components)/,
        loader: 'babel-loader',
        query: {
          presets: ['env']
        }
      }
    ]
  }
};
