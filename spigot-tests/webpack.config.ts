import * as path from 'path';
import * as webpack from 'webpack';

const config: webpack.Configuration = {
  mode: 'development',
  entry: './tests/index.ts',
  externals: {
    'genesys-cloud-streaming-client': 'GenesysCloudStreamingClient',
    'genesys-cloud-webrtc-sdk': 'GenesysCloudWebrtcSdk',
    'chai': 'chai'
  },
  module: {
    rules: [
      {
        test: /\.ts?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    path: path.resolve(__dirname, 'bin'),
    filename: 'tests.js',
  },
};

export default config;