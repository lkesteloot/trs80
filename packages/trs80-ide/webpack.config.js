
import path from "path";
import { URL } from 'url';
import HtmlWebpackPlugin from "html-webpack-plugin";

// Replace __dirname from non-module node. May not work well if there are
// spaces in the path (will show up as %20).
const __dirname = new URL('.', import.meta.url).pathname;

const exports = {
    mode: "development",
    entry: "./src/index.ts",
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                include: path.resolve(__dirname, 'src'),
                use: {
                    loader: "ts-loader",
                    options: {
                        transpileOnly: true,
                    },
                },
                exclude: /node_modules/,
            },
        ],
    },
    plugins: [
        new HtmlWebpackPlugin({
            title: 'Output Management',
        }),
    ],
    devServer: {
        static: './dist',
    },
};

export default exports;

