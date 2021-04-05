const path = require("path");
const WebpackBuildNotifierPlugin = require("webpack-build-notifier");
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

module.exports = {
    mode: "development",

    output: {
        path: path.resolve(__dirname, 'docs/dist'),
        filename: "[name].js"
    },

    // Enable sourcemaps for debugging webpack's output.
    devtool: "source-map",

    resolve: {
        extensions: [".ts", ".js"],
        symlinks: false,
    },

    // Disable making source maps, they double the build time.
    devtool: false,

    cache: {
        type: "filesystem",
    },

    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                loader: "ts-loader",
                options: {
                    // Shaves about 2 seconds:
                    // transpileOnly: true,
                },
            },
            // All output '.js' files will have any sourcemaps re-processed by 'source-map-loader'.
            {
                enforce: "pre",
                test: /\.js$/,
                loader: "source-map-loader"
            }
        ]
    },

    optimization: {
        // Much faster to not minimize. About halves the size of the JS file.
        minimize: false,

        splitChunks: {
            cacheGroups: {
                "trs80-emulator": {
                    test: /\/node_modules\/trs80-emulator/,
                    name: "trs80-emulator",
                    priority: 10,
                    chunks: "all",
                },
                "z80-emulator": {
                    test: /\/node_modules\/z80-emulator/,
                    name: "z80-emulator",
                    priority: 10,
                    chunks: "all",
                },
                "trs80-z80": {
                    test: /\/node_modules\/(z80|trs80)/,
                    name: "trs80-z80",
                    priority: 5,
                    chunks: "all",
                },
                vendors: {
                    test: /\/node_modules\//,
                    name: "vendors",
                    priority: 0,
                    chunks: "all",
                },
            },
        },
    },

    plugins: [
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
        // new BundleAnalyzerPlugin(),
    ],

    performance: {
        hints: false,
        maxEntrypointSize: 1024*1024,
        maxAssetSize: 1024*1024,
    },
};
