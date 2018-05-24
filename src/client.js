'use strict';

import WildEmitter from 'wildemitter';

function validateOptions (options) {
  if (!options) {
    throw new Error('Options required to create an instance of the SDK');
  }
}

class PureCloudWebrtcSdk extends WildEmitter {
  constructor (options) {
    super();
    validateOptions(options);

    this._connected = false;
    this._streamingConnection = null;
  }

  get connected () {
    return !!this._connected;
  }
}

module.exports = PureCloudWebrtcSdk;
