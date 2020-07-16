const fs = require('fs');
const version = require('./package.json').version;

if (!version) {
  console.error('No version was found in "./package.json"');
  process.exit(1);
}

fs.writeFileSync('dist/package.json', JSON.stringify({ version }, null, 2));
