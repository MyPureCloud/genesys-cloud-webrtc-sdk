const { v4: uuidv4 } = require('uuid');

// Check if the crypto object exists (it might not in some environments)
if (typeof global.crypto === 'undefined') {
  global.crypto = {};
}

// Polyfill the randomUUID method
if (!global.crypto.randomUUID) {
  global.crypto.randomUUID = uuidv4;
}
