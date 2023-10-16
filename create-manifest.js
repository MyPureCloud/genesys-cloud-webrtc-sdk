#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { versionDir, majorVersionDir } = require('./webpack.config');

const buildDate = new Date();

const manifest = {
  name: process.env.APP_NAME,
  version: process.env.VERSION,
  build: process.env.BUILD_ID,
  buildDate: buildDate.toISOString(),
  indexFiles: []
};

/* add demo */
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
          file: 'demo/' + file + '/' + dirFile
        });
      });
      return;
    }
    manifest.indexFiles.push({
      file: 'demo/' + file
    });
  });
} catch (e) {
  // demo dir (examples don't exist)
}

/* add versioned bundles for CDN */
function dirWalk (dir) {
  const files = [];
  function walk (dir) {
    fs.readdirSync(dir).forEach(file => {
      const absolute = path.join(dir, file);
      if (fs.statSync(absolute).isDirectory()) return walk(absolute);
      else files.push(absolute);
    });
    return files;
  }

  return walk(dir);
}

[...dirWalk(versionDir), ...dirWalk(majorVersionDir)]
  .forEach(filename => manifest.indexFiles.push({ file: filename.replace('dist/', '') }));

fs.writeFileSync('./dist/manifest.json', JSON.stringify(manifest, null, 2), { encoding: 'utf8' });