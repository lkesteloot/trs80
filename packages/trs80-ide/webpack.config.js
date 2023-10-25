
import path from "path";
import { URL } from 'url';
import HtmlWebpackPlugin from "html-webpack-plugin";
import MiniCssExtractPlugin from "mini-css-extract-plugin";

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
            {
                test: /\.css$/i,
                use: [MiniCssExtractPlugin.loader, "css-loader"],
            },
            {
                test: /\.png$/i,
                use: [
                    {
                        loader: "file-loader",
                    },
                ],
            },
            {
                test: /\.ico/i,
                use: [
                    {
                        loader: "raw-loader",
                    },
                ],
            },
        ],
    },
    plugins: [
        new HtmlWebpackPlugin({
            title: "TRS-80 IDE",
            template: "src/index-template.ejs",
            hash: true,
            favicon: "./src/48k.png",
        }),
        new MiniCssExtractPlugin(),
    ],
    devServer: {
        static: './dist',
    },
    devtool: 'inline-source-map',
    resolve: {
        extensions: [".ts", ".js"],
        extensionAlias: {
            ".js": [".ts", ".js"],
        },
    },
};

export default exports;

