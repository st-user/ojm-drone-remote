const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const packageInfo = require('./package.json');
const path = require('path');

module.exports = {
    entry: {
        main: './src/index.js',
        style: './src/style.js'
    },
    output: {
        filename: './js/[name].js',
        path: path.resolve(__dirname, '../server/dist/'),
    },
    module: {
        rules: [
            {
                test: /\.css$/i,
                use: [
                    {
                        loader: 'style-loader',
                        options: {
                            injectType: 'singletonStyleTag'
                        }
                    },
                    'css-loader'],
            },
            {
                test: /\.(png|svg|jpg|jpeg|gif)$/i,
                type: 'asset/resource',
                generator: {
                    filename: '[hash][ext]' + '?q=' + packageInfo.version
                }
            },
            {
                test: /\.m?js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env']
                    }
                }
            }
        ],
    },
    plugins: [
        new CleanWebpackPlugin(),
        new CopyPlugin({
            patterns: [
                { from: './html/index.html', to: '.' },
                { from: './assets/favicon.ico', to: '.' },
                { from: './assets/poster.png', to: '.' }
            ],
        })
    ]
};
