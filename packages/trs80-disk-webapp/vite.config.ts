import {defineConfig} from "vite";
import {resolve} from "node:path";

/**
 * Two pages, built together so that they share chunks: the Disk workbench at /disk/ and
 * Disk Commander at /commander/. The package's root index.html only links to them for the
 * dev server, so it's left out of the inputs.
 */
export default defineConfig({
    base: "/",
    build: {
        // Shared chunks go in dist/disk-assets rather than dist/assets, because deploy/my-trs-80
        // merges this app's dist into the site next to my-trs-80's own site/assets.
        assetsDir: "disk-assets",
        rolldownOptions: {
            input: {
                disk: resolve(import.meta.dirname, "disk/index.html"),
                commander: resolve(import.meta.dirname, "commander/index.html"),
            },
        },
    },
});
