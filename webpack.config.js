const path = require('path');
const WebpackAutoInject = require('webpack-auto-inject-version');

module.exports = {
  entry: './src/client.ts',
  mode: 'production',
  output: {
    path: path.resolve(__dirname, 'web'),
    filename: 'purecloud-webrtc-sdk.js',
    library: 'PureCloudWebrtcSdk',
    libraryTarget: 'umd'
  },
  plugins: [
    new WebpackAutoInject({
      components: {
        AutoIncreaseVersion: false,
        InjectByTag: {
          fileRegex: /\.+/,
          AIVTagRegexp: /(\[AIV])(([a-zA-Z{} ,:;!()_@\-"'\\\/])+)(\[\/AIV])/g // eslint-disable-line
        }
      }
    })
  ],
  resolve: {
    extensions: ['.ts', '.js', '.json']
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
      },
      {
        test: /\.ts$/,
        exclude: /(node_modules|bower_components)/,
        loader: 'awesome-typescript-loader'
      }
    ]
  }
};
