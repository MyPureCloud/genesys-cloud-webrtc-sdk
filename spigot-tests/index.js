const { Spigot } = require('genesyscloud-spigot/dist/src/index');

const config = {
  oauth: {
    clientId: 'ff22e32c-2948-4ff4-8f2c-1c379d28e84d'
  },
  credentials: {
    org: 'TEST-valve-1ym37mj1kao',
    username: 'agent-7-1ym37mj1kao@example.com',
    password: 'fV-qIe4HZtGM1yLr}^'
  },
  headless: !!process.env.SINGLE_RUN,
  testPort: '8443',
  envHost: 'inindca.com',
  outboundNumber: '3172222222',
  filter: '',
  validationTimeout: '8000',
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
