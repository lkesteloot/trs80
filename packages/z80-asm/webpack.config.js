const path = require("path");
const WebpackBuildNotifierPlugin = require("webpack-build-notifier");
const webpack = require("webpack");
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: "production",

    entry: "./src/index.ts",

    output: {
        path: path.resolve(__dirname, "docs/dist"),
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
        ]
    },

    // Put node_modules files in their own dist file, since they rarely change.
    optimization: {
        minimize: false,
        splitChunks: {
            cacheGroups: {
                commons: {
                    test: /\/node_modules\//,
                    name: "vendor",
                    chunks: "initial",
                },
                opcodes: {
                    test: /Opcodes.ts/,
                    name: "opcodes",
                    chunks: "initial",
                },
            },
        },
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
            {
                from: "node_modules/codemirror/lib/codemirror.css",
            },
            {
                from: "node_modules/codemirror/theme/mbo.css",
            },
            {
                from: "node_modules/codemirror/addon/dialog/dialog.css",
            },
        ]),
    ],

    // Quiet warnings about code size:
    performance: {
        hints: false,
        maxEntrypointSize: 1024*1024,
        maxAssetSize: 1024*1024,
    },
};
