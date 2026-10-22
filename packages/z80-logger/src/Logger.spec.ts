import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {LogLevel, makeBatchingSink} from "./Logger.js";

describe("makeBatchingSink", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    /**
     * Make a batching sink that records what it delegates to.
     */
    function makeRecordingSink(): {sink: ReturnType<typeof makeBatchingSink>, output: string[]} {
        const output: string[] = [];
        const sink = makeBatchingSink((level, message) => output.push(LogLevel[level] + ": " + message));
        return {sink, output};
    }

    it("flushes the last message after a delay", () => {
        const {sink, output} = makeRecordingSink();
        sink(LogLevel.WARN, "hello");
        expect(output).to.eql([]);
        vi.advanceTimersByTime(1000);
        expect(output).to.eql(["WARN: hello"]);
    });

    it("collapses repeats", () => {
        const {sink, output} = makeRecordingSink();
        sink(LogLevel.INFO, "a");
        sink(LogLevel.INFO, "a");
        sink(LogLevel.INFO, "a");
        sink(LogLevel.INFO, "b");
        expect(output).to.eql(["INFO: a (x3)"]);
        vi.advanceTimersByTime(1000);
        expect(output).to.eql(["INFO: a (x3)", "INFO: b"]);
    });

    it("prints a repeat after a flush as a new message", () => {
        const {sink, output} = makeRecordingSink();
        sink(LogLevel.INFO, "a");
        vi.advanceTimersByTime(1000);
        sink(LogLevel.INFO, "a");
        vi.advanceTimersByTime(1000);
        expect(output).to.eql(["INFO: a", "INFO: a"]);
    });
});
