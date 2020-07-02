#!/usr/bin/env node

const fs = require('fs');

const buildDate = new Date();

const manifest = {
  name: process.env.APP_NAME,
  version: process.env.VERSION,
  build: process.env.BUILD_ID,
  buildDate: buildDate.toISOString(),
  indexFiles: []
};

/* read top level purecloud-webrtc-sdk file variations */
const files = fs.readdirSync('dist/');
files.forEach(file => {
  /* skip directories and non-js files */
  if (
    fs.lstatSync('dist/' + file).isDirectory() ||
    !file.startsWith('purecloud-webrtc-sdk')
  ) {
    return;
  }

  manifest.indexFiles.push({ file });
});

try {
  const files = fs.readdirSync('dist/demo/');
  files.forEach(file => {
    if (fs.lstatSync('dist/demo/' + file).isDirectory()) {
      const dirFiles = fs.readdirSync('dist/demo/' + file);
      dirFiles.forEach(dirFile => {
        if (fs.lstatSync('dist/demo/' + file + '/' + dirFile).isDirectory()) {
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

fs.writeFileSync('./dist/manifest.json', JSON.stringify(manifest, null, 2), { encoding: 'utf8' });
