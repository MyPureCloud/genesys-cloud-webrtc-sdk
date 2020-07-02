const path = require('path');
const WebpackAutoInject = require('webpack-auto-inject-version');

module.exports = (env) => {
  const minimize = env && env.production;
  const cdn = env && env.cdn;
  const mode = minimize ? 'production' : 'development';

  let filename = 'purecloud-webrtc-sdk';

  if (cdn) {
    filename += '.bundle';
  }

  if (minimize) {
    filename += '.min';
  }

  filename += '.js';

  console.log(`build mode: ${mode}`);

  return {
    target: 'web',
    entry: './src/client.ts',
    mode,
    optimization: {
      minimize
    },
    devtool: 'source-map',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename,
      library: 'PureCloudWebrtcSdk',
      libraryExport: cdn ? 'PureCloudWebrtcSdk' : '',
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
      extensions: ['.ts', '.js', '.cjs', '.mjs', '.json']
    },
    module: {
      rules: [
        {
          test: /\.(c|m)?js|ts$/,
          exclude: [
            /\@babel\//,
            /\bcore-js\b/,
            /\bwebpack\/buildin\b/,
          ],
          loader: ['babel-loader'/* , 'ts-loader' */],
          // query: {
          //   presets: ['@babel/preset-env']
          // }
        },
        // {
        //   test: /\.ts$/,
        //   exclude: /(node_modules|bower_components)/,
        //   loader: 'ts-loader'
        // }
      ]
    }
  };
};
