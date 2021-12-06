const { execSync } = require('child_process');

execSync('npm version patch --no-git-tag-version');

const version = require('../package.json').version;

execSync(`git commit -am "Prep version: ${version}"`);
execSync('git push origin HEAD:master --tags');