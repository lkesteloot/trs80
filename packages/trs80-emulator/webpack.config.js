const path = require("path");
var WebpackBuildNotifierPlugin = require("webpack-build-notifier");

module.exports = {
    mode: "production",

    entry: {
        // Different entry point for app (vs. library).
        app: "./src/Main.ts",
    },

    output: {
        path: path.resolve(__dirname, 'docs/dist'),
        filename: "main.js"
    },

    // Enable sourcemaps for debugging webpack's output.
    /// devtool: "source-map",

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
                        loader: "ts-loader"
                    }
                ]
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
        minimize: false
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
    ],

    // When importing a module whose path matches one of the following, just
    // assume a corresponding global variable exists and use that instead.
    // This is important because it allows us to avoid bundling all of our
    // dependencies, which allows browsers to cache those libraries between builds.
    /*
    externals: {
        "react": "React",
        "react-dom": "ReactDOM"
    }
     */
    performance: {
        hints: false,
        maxEntrypointSize: 1024*1024,
        maxAssetSize: 1024*1024,
    },
};
