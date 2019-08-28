const path = require('path');
const WebpackAutoInject = require('webpack-auto-inject-version');

module.exports = (env) => {
  const minimize = env && env.production;
  const node = env && env.node;
  const file = `purecloud-webrtc-sdk${minimize ? '.min' : ''}`;
  const extension = node ? '.cjs' : '.js';
  const filename = file + extension;

  return {
    target: node ? 'node' : 'web',
    entry: './src/client.ts',
    mode: minimize ? 'production' : 'development',
    optimization: {
      minimize
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename,
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
            presets: ['@babel/preset-env']
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
};
