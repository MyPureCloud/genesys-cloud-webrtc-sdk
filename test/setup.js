process.on('unhandledRejection', (err) => {
  fail(err);
});

// switch axios over to http so it actually makes requests that can get intercepted by nock
const axios = require('axios');
const path = require('path');
const lib = path.join(path.dirname(require.resolve('axios')),'lib/adapters/http');
const http = require(lib);
axios.defaults.adapter = http;