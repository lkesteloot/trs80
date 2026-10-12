import {defineConfig} from "vitest/config";

// Runs every package's tests with "npm test" from the root. A package's own tests run
// with "npm test -w packages/<name>", which finds them with Vitest's defaults.
export default defineConfig({
    test: {
        include: ["packages/*/{src,tests}/**/*.{test,spec}.ts"],
        // Vitest suggests turning this on after every run, unless it's set explicitly.
        // The tests take a second, so caching isn't worth it.
        fsModuleCache: false,
    },
});
