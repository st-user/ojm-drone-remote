const path = '../server/dist/index.html';
const packageInfo = require('../package.json');

const insertScript = require('./google-analytics-insert.js');
const replaceVersion = require('./version-replace.js');


insertScript(path);
replaceVersion(path, packageInfo.version);