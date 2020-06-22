const path = require('path');
const WebpackAutoInject = require('webpack-auto-inject-version');

module.exports = (env) => {
  const minimize = env && env.production;
  const filename = `purecloud-webrtc-sdk${minimize ? '.min' : ''}.js`;
  const mode = minimize ? 'production' : 'development';

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
      extensions: ['.ts', '.js', '.cjs', '.mjs', /* '.json' */]
    },
    // resolve: {
    //   alias: {
    //     'purecloud-streaming-client': path.join(__dirname, './node_modules/purecloud-streaming-client/dist/streaming-client.cjs')
    //   }
    // },
    module: {
      rules: [
        {
          test: /\.(c|m)?js|ts$/,
          exclude: [
            /\@babel\//,
            /\bcore-js\b/,
            /\bwebpack\/buildin\b/,
          ],
          // exclude: /(node_modules)/, // \/(!?[purecloud\-streaming\-client])/,
          // include: /node_modules\/purecloud\-streaming\-client/,
          loader: ['babel-loader', 'ts-loader'],
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
