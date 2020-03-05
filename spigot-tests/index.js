const { Spigot } = require('genesyscloud-spigot/dist/src/index');

let envConfig = {};

const defaultDevConfig = {
  OAUTH_CLIENT_ID: 'ff22e32c-2948-4ff4-8f2c-1c379d28e84d',
  ORG: 'TEST-valve-1ym37mj1kao',
  USERNAME: 'agent-7-1ym37mj1kao@example.com',
  PASSWORD: 'fV-qIe4HZtGM1yLr}^',
  ENV_HOST: 'inindca.com'
};

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

const config = {
  oauth: {
    clientId: envConfig.OAUTH_CLIENT_ID
  },
  credentials: {
    org: envConfig.ORG,
    username: envConfig.USERNAME,
    password: envConfig.PASSWORD
  },
  headless: !!process.env.SINGLE_RUN || process.env.CI_MODE,
  testPort: '8443',
  envHost: envConfig.ENV_HOST,
  outboundNumber: '3172222222',
  filter: '',
  validationTimeout: '15000',
  iceTransportPolicy: 'all',
  testGlob: 'tests/*'
};

async function runTests () {
  try {
    const spigot = new Spigot(config);

    console.info('starting spigot tests');
    await spigot.start();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }

  console.info('tests passed!');
  process.exit(0);
}

runTests();
