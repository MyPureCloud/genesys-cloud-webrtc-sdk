#!/usr/bin/env node

const fs = require('fs');

const buildDate = new Date();

const manifest = {
  name: process.env.APP_NAME,
  version: process.env.VERSION,
  build: process.env.BUILD_ID,
  buildDate: buildDate.toISOString(),
  indexFiles: [
    {
      file: 'purecloud-webrtc-sdk.js'
    }
  ]
};

try {
  const files = fs.readdirSync('web/demo/');
  files.forEach(file => {
    if (fs.lstatSync('web/demo/' + file).isDirectory()) {
      const dirFiles = fs.readdirSync('web/demo/' + file);
      dirFiles.forEach(dirFile => {
        if (fs.lstatSync('web/demo/' + file + '/' + dirFile).isDirectory()) {
          return;
        }
        manifest.indexFiles.push({
          file: '/demo/' + file + '/' + dirFile
        });
      });
      return;
    }
    manifest.indexFiles.push({
      file: '/demo/' + file
    });
  });
} catch (e) {
  // demo dir (examples don't exist)
}

fs.writeFileSync('./web/manifest.json', JSON.stringify(manifest, null, 2), { encoding: 'utf8' });
