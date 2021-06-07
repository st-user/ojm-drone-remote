const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');

module.exports = merge(common, {
    mode: 'production',
    module: {
        rules: [
            {
                test: /^(?!.*Logger).+\.js$/,
                loader: 'webpack-remove-debug'
            }
        ]
    } 
});
