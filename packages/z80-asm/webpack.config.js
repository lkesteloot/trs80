const path = require("path");
const WebpackBuildNotifierPlugin = require("webpack-build-notifier");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const webpack = require("webpack");

const mode = "development";

const main_config = {
    mode: mode,
    target: "electron-main",

    entry: {
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

    node: {
        // Disable webpack's polyfill for __dirname, which always equals "/".
        // We need it to find electron-preload.js.
        __dirname: false,
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
    ],
};

const renderer_config = {
    mode: mode,
    target: "electron-renderer",

    entry: {
        "electron-renderer": "./src/ide/Ide.ts",
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

        new HtmlWebpackPlugin({
            template: "src/ide/index.html",
            minify: false,
        }),
    ],
};

const preload_config = {
    mode: mode,
    target: "electron-preload",

    entry: {
        "electron-preload": "./src/main/preload.js",
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
    ],
};

const node_config = {
    mode: mode,
    target: "node",

    entry: {
        zasm: "./src/zasm/Main.ts",
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
    ],
};

module.exports = [
    main_config,
    renderer_config,
    preload_config,
    node_config,
];
