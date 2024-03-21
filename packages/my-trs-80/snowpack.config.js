
/** @type {import("snowpack").SnowpackUserConfig } */
export default {
    workspaceRoot: "..",
    plugins: ['@snowpack/plugin-typescript'],
    mount: {
        "docs": "/",
        "src": "/dist",
    },
};

