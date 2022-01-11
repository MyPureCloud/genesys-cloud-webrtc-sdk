import { execSync as Child } from 'child_process';
import FS from 'fs';

const { fileNames, version, versionDir, majorVersion, majorVersionDir } = require('../webpack.config');
const bundleFileNames: string[] = Object.values(fileNames);

function fileReplace (fileName: string, placeholder: string, value: string) {
  const originalFile = FS.readFileSync(fileName).toString();
  FS.writeFileSync(fileName, originalFile.replace(placeholder, value));
}

/* build commonjs and esModules using tsc */
Child('npm run build:cjs');
Child('npm run build:es');
/* build the bundled cdn version via webpack */
Child('npm run build:cdn');

/* embed package version into CJS and ES modules */
const filesToInjectVersion = [
  'dist/cjs/client.d.ts',
  'dist/cjs/client.js',
  'dist/es/client.d.ts',
  'dist/es/client.js'
].concat(bundleFileNames.map(file => `${versionDir}/${file}`));

console.log('Files to inject version into', { filesToInjectVersion, version });
filesToInjectVersion.forEach(file => {
  fileReplace(file, '__GENESYS_CLOUD_WEBRTC_SDK_VERSION__', version);
  console.log(`  Replaced version (${version}) in "${file}"`);
});

/* after we have copied over the version, we can bundle using webpack */
const cdnFilesWithPath: string[] = [];

/* copy over bundled files to non-bundled file names – for backward compat */
bundleFileNames.forEach(filename => {
  const fromFile = `${versionDir}/${filename}`;
  if (!FS.existsSync(fromFile)) {
    return console.warn(`File did not exist. not able to copy it over: "${fromFile}"`);
  }

  const toFile = fromFile.replace('.bundle', '');
  console.log('Copying bundle file to non-bundle name', { fromFile, __toFile: toFile });
  Child(`cp ${fromFile} ${toFile}`);
  cdnFilesWithPath.push(fromFile);
  cdnFilesWithPath.push(toFile);
});

/* create our major version folder */
if (!FS.existsSync(majorVersionDir)) {
  FS.mkdirSync(majorVersionDir);
}

/* copy to our major version and root directories */
cdnFilesWithPath.forEach(fromFile => {
  if (!FS.existsSync(fromFile)) {
    return console.warn(`File did not exist. not able to copy it over: "${fromFile}"`);
  }

  const toMajorVersionFile = fromFile.replace(versionDir, majorVersionDir);
  console.log(`Copying v${version} file to v${majorVersion}`, { fromFile, __toFile: toMajorVersionFile });
  Child(`cp ${fromFile} ${toMajorVersionFile}`);

  /*
    for backwards compat for apps that load from:
    node_modules/genesys-cloud-webrtc-sdk/dist/genesys-cloud-webrtc-sdk.js
  */
  const toRootDistFile = fromFile.replace(versionDir, 'dist/');
  console.log(`Copying ${version} file to dist/`, { fromFile, __toFile: toRootDistFile });
  Child(`cp ${fromFile} ${toRootDistFile}`);
});