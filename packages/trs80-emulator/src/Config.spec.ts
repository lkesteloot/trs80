import {describe, expect, it} from "vitest";
import {Config} from "./Config.js";

// Tests for Config serialization and comparison.

describe("config", () => {
    it("round trips the grid setting", () => {
        const config = Config.makeDefault().edit().withGrid(true).build();
        const deserialized = Config.deserialize(config.serialize());
        expect(deserialized.grid).to.equal(true);
        expect(deserialized.equals(config)).to.equal(true);
    });
    it("compares the grid setting", () => {
        const config = Config.makeDefault();
        expect(config.equals(config.edit().withGrid(true).build())).to.equal(false);
    });
});
