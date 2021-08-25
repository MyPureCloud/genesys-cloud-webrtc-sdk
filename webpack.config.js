const path = require('path');
const WebpackAutoInject = require('webpack-auto-inject-version');

module.exports = (env) => {
  const minimize = env && env.production;
  const cdn = env && env.cdn;
  const mode = minimize ? 'production' : 'development';

  let filename = 'genesys-cloud-webrtc-sdk';
  let babelExcludes = [];
  let babelOptions;
  let externals = [];

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

    babelOptions = {
      sourceType: 'unambiguous',
      presets: [
        ['@babel/preset-env', {
          debug: false,
          targets: [
            'last 2 versions',
            '> 5%',
            'IE 11',
            'not dead'
          ]
        }],
        '@babel/preset-typescript'
      ],
      plugins: [
        ['@babel/plugin-transform-runtime', {
          corejs: 3
        }],
        '@babel/plugin-proposal-class-properties',
        '@babel/plugin-transform-property-mutators'
      ]
    };

    filename += '.bundle';
  } else {
    /* if we are building for 'module', don't polyfill, transpile, or bundle any dependencies – except stanza because it has node deps... */
    babelExcludes = [/node_modules\/(?!(core\-util\-is)).*/];

    babelOptions = {
      sourceType: 'unambiguous',
      presets: [
        '@babel/preset-env',
        '@babel/preset-typescript'
      ],
      plugins: [
        '@babel/plugin-proposal-class-properties'
      ]
    };
  }

  filename += minimize ? '.min.js' : '.js';

  console.log(`build mode: ${mode}`);

  return {
    target: 'web',
    entry: './src/index.ts',
    mode,
    optimization: {
      minimize
    },
    externals,
    devtool: 'source-map',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename,
      library: 'GenesysCloudWebrtcSdk',
      // TODO: exporting the SDK class here does not allow CDN imports access to any
      //  other files/modules of this lib. See: https://inindca.atlassian.net/browse/PCM-1708
      libraryExport: cdn ? 'GenesysCloudWebrtcSdk' : '',
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
          loader: 'babel-loader',
          exclude: babelExcludes,
          options: babelOptions
        }
      ]
    }
  };
};
