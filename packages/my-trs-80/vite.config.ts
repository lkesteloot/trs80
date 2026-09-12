import {defineConfig} from "vite";

export default defineConfig({
    build: {
        // The app is one large bundle, which is fine. Only warn if it gets much bigger.
        chunkSizeWarningLimit: 5000, // kB
    },
});
