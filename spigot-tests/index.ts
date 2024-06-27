import { execSync as Child } from 'child_process';
import fs from 'fs';
import * as rollup from 'rollup';
import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import globMod from 'glob';
import util from 'util';
import json from '@rollup/plugin-json';
import polyfills from 'rollup-plugin-node-polyfills';
import typescript from 'rollup-plugin-typescript2';
import stupidServer from 'stupid-server';
import { PuppeteerManager } from './puppeteer/launch';
import { TestConfig } from './types/test-config';
import sdkPkg from '../package.json';
import { v4 as uuidv4 } from 'uuid';

let config: TestConfig;

const defaultDevConfig = {
  OAUTH_CLIENT_ID: 'ff22e32c-2948-4ff4-8f2c-1c379d28e84d',
  ORG: 'TEST-valve-1ym37mj1kao',
  USERNAME: 'agent-7-1ym37mj1kao@example.com',
  PASSWORD: 'fV-qIe4HZtGM1yLr}^',
  ENV_HOST: 'inindca.com'
};

const buildDir = './bin';

const ts = typescript({
  typescript: require('typescript'),
  tsconfig: 'test.tsconfig.json'
});

const glob = util.promisify(globMod);

async function buildConfig () {
  let envConfig: any = {};

  const ciMode = process.env.CI_MODE === 'true';

  ['ORG', 'USERNAME', 'PASSWORD', 'ENV_HOST', 'OAUTH_CLIENT_ID'].forEach((name) => {
    const value = process.env[name];
    if (!value) {
      if (ciMode) {
        console.error(`Missing required environment variable for ci mode: ${name}`);
        process.exit(1);
      }
    }

    envConfig[name] = value || defaultDevConfig[name];
  });

  const envHost = envConfig.ENV_HOST;

  config = {
    testOutputPath: 'reports/xunit.xml',
    oauth: {
      urlBase: `https://login.${envHost}/`,
      urlPath: 'oauth/authorize',
      clientId: envConfig.OAUTH_CLIENT_ID,
      redirectUri: 'https://localhost:8443/'
    },
    credentials: {
      org: envConfig.ORG,
      username: envConfig.USERNAME,
      password: envConfig.PASSWORD
    },
    appName: 'webrtc-sdk',
    appVersion: sdkPkg.version,
    envHost,
    headless: (process.env.SINGLE_RUN === 'true') || (process.env.CI_MODE === 'true'),
    logLevel: (process.env.LOG_LEVEL as any) || 'info',
    filter: process.env.FILTER || '',
    outboundNumber: '3172222222',
    callDelay: 200,
    apiUrl: `https://api.${envHost}/api/v2`,
    personDetailsUrl: `https://api.${envHost}/api/v2/users/me`,
    host: `wss://streaming.${envHost}`,
    uuid: uuidv4(),
    validationTimeout: 15000
  };

  if (!config.credentials.username) {
    console.error(new Error('must provide login credentials'));
    process.exit(1);
  }
}

async function compileTestRunner () {
  const bundle = await rollup.rollup({
    input: 'browser/test-runner.js',
    plugins: [commonjs(), nodeResolve({ preferBuiltins: false })]
  });
  await bundle.write({
    file: `${buildDir}/test-runner.js`,
    format: 'umd',
    name: 'test-runner'
  });
  console.info('finished compiling test runner');
}

async function compileTests () {
  Child('npm run build:tests');
}

function copyStatics () {
  fs.copyFileSync('browser/index.html', `${buildDir}/index.html`);
  fs.copyFileSync('../dist/genesys-cloud-webrtc-sdk.bundle.js', `${buildDir}/genesys-cloud-webrtc-sdk.bundle.js`);
  fs.copyFileSync('node_modules/genesys-cloud-streaming-client/dist/streaming-client.browser.js', `${buildDir}/streaming-client.bundle.js`);

  const redactedConfig: TestConfig = JSON.parse(JSON.stringify(config));
  delete redactedConfig.credentials.password;
  fs.writeFileSync(`${buildDir}/test-config.js`, `window.testConfig = ${JSON.stringify(redactedConfig)}`);
}

function startServer () {
  stupidServer({
    secure: true,
    path: buildDir
  }, function (err) {
    if (err) {
      throw err;
    }
  });
}

async function runPuppeteer () {
  const manager = new PuppeteerManager(config, console as any);
  await manager.launch();
}

Child('npm run clean');
Child('mkdir bin');
buildConfig();
compileTestRunner();
compileTests();
copyStatics();
startServer();
runPuppeteer();
