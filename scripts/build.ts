import { execSync as Child } from 'child_process';
import FS from 'fs';

// const Pkg = JSON.parse(FS.readFileSync('package.json').toString());
const version = require('../package.json').version;
const fileNames = require('../webpack.config').fileNames;
const bundleFileNames = Object.values(fileNames);

function fileReplace (fileName: string, placeholder: string, value: string) {
  const originalFile = FS.readFileSync(fileName).toString();
  FS.writeFileSync(fileName, originalFile.replace(placeholder, value));
}

/* build commonjs and esModules using tsc */
Child('npm run build:cjs');
Child('npm run build:es');
/* build bundled esModules */
Child('npm run build:rollup');
/* build the bundled cdn version via webpack */
Child('npm run build:cdn');

/* embed package version into CJS and ES modules */
const filesToInjectVersion = [
  'dist/cjs/client.d.ts',
  'dist/cjs/client.js',
  'dist/es/client.d.ts',
  'dist/es/client.js'
].concat(bundleFileNames.map(file => `dist/${file}`));

console.log('Files to inject version into', { filesToInjectVersion, version });
filesToInjectVersion.forEach(file => {
  fileReplace(file, '__GENESYS_CLOUD_WEBRTC_SDK_VERSION__', version);
  console.log(`  Replaced version (${version}) in "${file}"`);
});

/* after we have copied over the version, we can bundle using webpack */

/* copy over bundled files to non-bundled file names – for backward compat */
bundleFileNames.forEach(filename => {
  const fromFile = `dist/${filename}`;
  if (!FS.existsSync(fromFile)) {
    return console.warn(`File did not exist. not able to copy it over: "${fromFile}"`);
  }

  const toFile = fromFile.replace('.bundle', '');
  console.log('Copying bundle file to non-bundle name', { fromFile, __toFile: toFile });
  Child(`cp ${fromFile} ${toFile}`);
});