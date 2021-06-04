const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const LicensePlugin = require('webpack-license-plugin');
const path = require('path');
const packageInfo = require('./package.json');

module.exports = merge(common, {
    entry: {
        'license-gen': './license-gen/index.js'
    },
    output: {
        path: path.resolve(__dirname, 'dist-discard/'),
    },
    plugins: [
        new LicensePlugin({
            excludedPackageTest: (packageName) => {
                if (packageName.startsWith('vncho-lib')) {
                    return true;
                }
                return false;
            },
            outputFilename: `../dist/oss-licenses.json`
        })
    ]
});
