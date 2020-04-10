const path = require("path");
const WebpackBuildNotifierPlugin = require("webpack-build-notifier");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const webpack = require("webpack");
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: "production",

    entry: {
        // "electron-renderer": "./src/ide/Ide.ts",
        // zasm: "./src/zasm/Main.ts",
        "electron-main": "./src/main/electron-main.ts",
    },

    output: {
        path: path.resolve(__dirname, "dist"),
    },

    // Enable sourcemaps for debugging webpack's output.
    devtool: "source-map",

    resolve: {
        extensions: [".ts", ".js"]
    },

    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: "ts-loader",
                        options: {
                            projectReferences: true
                        }
                    }
                ]
            },
            // All output '.js' files will have any sourcemaps re-processed by 'source-map-loader'.
            {
                enforce: "pre",
                test: /\.js$/,
                loader: "source-map-loader"
            },
            // Handle CSS files.
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader']
            },
        ]
    },

    plugins: [
        // Make a sound when compile finishes.
        new WebpackBuildNotifierPlugin({
            logo: path.resolve(__dirname, "docs/favicon.ico"),
            // List of sounds: https://github.com/mikaelbr/node-notifier
            successSound: "Pop",
            failureSound: "Basso",
            warningSound: "Basso",
            notifyOptions: {
                timeout: 1,
            },
        }),

        // Make sure we ignore generated files or the --watch flag will go into a loop.
        new webpack.WatchIgnorePlugin([
                              /\.js$/,
                              /\.d\.ts$/,
                              /node_modules/,
        ]),

        // Copy CSS files.
        new CopyPlugin([
            //{
                //from: "src/main/electron-main.js",
            //},
            {
                from: "src/main/preload.js",
            },
        ]),

        new HtmlWebpackPlugin({
            template: "src/ide/index.html",
            minify: false,
        }),
    ],

    // Quiet warnings about code size:
    performance: {
        hints: false,
        maxEntrypointSize: 1024*1024,
        maxAssetSize: 1024*1024,
    },
};
