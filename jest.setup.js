const { v4: uuidv4 } = require('uuid');

// Check if the crypto object exists (it might not in some environments)
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = {};
}

// Polyfill the randomUUID method
if (!globalThis.crypto.randomUUID) {
  globalThis.crypto.randomUUID = uuidv4;
}
