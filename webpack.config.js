const webpack = require('webpack');
const path = require('path');

/* used for copying to non `.bundle` filenames (see `scripts/build.ts`) */
const fileNames = {
  bundle: 'genesys-cloud-webrtc-sdk.bundle.js',
  bundleMap: 'genesys-cloud-webrtc-sdk.bundle.js.map',
  bundleMin: 'genesys-cloud-webrtc-sdk.bundle.min.js',
  bundleMinMap: 'genesys-cloud-webrtc-sdk.bundle.min.js.map'
};

module.exports = (env) => {
  const minimize = env && env.production;
  const cdn = env && env.cdn;
  const mode = minimize ? 'production' : 'development';

  const filename = `genesys-cloud-webrtc-sdk.bundle${minimize ? '.min.js' : '.js'}`;

  if (!cdn) {
    console.error(new Error('Webpack build can only be built for the CDN. \n  Be sure to pass in `--env.cdn` param to build script\n'));
    process.exit(1);
  }

  /*
    this is so babel doesn't try to polyfill/transpile core-js (which is the polyfill)
      and the build tools.
    But we want it polyfill/transpile all other node_modules when building for the web
  */
  const babelExcludes = [
    /@babel\//,
    /\bcore-js\b/,
    /\bwebpack\/buildin\b/
  ];

  const babelOptions = {
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

  console.log('building: ', env);


  const allowedFilenames = Object.values(fileNames);
  if (!allowedFilenames.includes(filename)) {
    console.error('Generated file name is not in the fileNames map', { allowedFilenames, filename });
    console.error(new Error('cannot build to desired file name'));
    process.exit(1);
  }

  return {
    target: 'web',
    entry: './src/index.ts',
    mode,
    optimization: {
      minimize
    },
    devtool: 'source-map',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename,
      library: 'GenesysCloudWebrtcSdk',
      libraryTarget: 'umd'
    },
    plugins: [
      new webpack.ProvidePlugin({
        process: 'process-fast'
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

module.exports.fileNames = fileNames;
