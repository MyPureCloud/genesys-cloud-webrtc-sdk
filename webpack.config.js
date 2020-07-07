const path = require('path');
const WebpackAutoInject = require('webpack-auto-inject-version');

module.exports = (env) => {
  const minimize = env && env.production;
  const cdn = env && env.cdn;
  const mode = minimize ? 'production' : 'development';

  let filename = 'purecloud-webrtc-sdk';
  let babelExcludes = [];

  /* if building for the cdn */
  if (cdn) {
    /*
      this is so babel doesn't try to polyfill/transpile core-js (which is the polyfill)
        and the build tools.
      But we want it polyfill/transpile all other node_modules when building for the web
    */
    babelExcludes = [
      /@babel\//,
      /\bcore-js\b/,
      /\bwebpack\/buildin\b/
    ];

    filename += '.bundle';
  } else {
    /* if we are building for 'module', don't polyfill/transpile any dependencies */
    babelExcludes = [/node_modules/];
  }

  filename += minimize ? '.min.js' : '.js';

  console.log(`build mode: ${mode}`);

  return {
    target: cdn ? 'web' : 'node',
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
          test: /\.(cjs|mjs|js|ts)$/,
          exclude: babelExcludes,
          loader: ['babel-loader']
          // query: {
          //   presets: ['@babel/preset-env']
          // }
        }
        // {
        //   test: /\.ts$/,
        //   exclude: /(node_modules|bower_components)/,
        //   loader: 'ts-loader'
        // },
        // {
        //   test: /\.json$/,
        //   exclude: /node_modules/,
        //   use: {
        //     // included by default (https://webpack.js.org/loaders/json-loader/)
        //     loader: 'json-loader'
        //   }
        // },
      ]
    }
  };
};
