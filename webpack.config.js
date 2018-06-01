const path = require('path');

module.exports = {
  entry: './src/client.js',
  mode: 'production',
  output: {
    path: path.resolve(__dirname, 'web'),
    filename: 'purecloud-webrtc-sdk.js',
    library: 'PureCloudWebrtcSdk',
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
