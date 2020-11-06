
export enum TestType {
    // Expect a pulse half-way through the WAV file.
    PULSE,
    // Expect no pulse half-way through the WAV file.
    NO_PULSE,
    // Expect a sequence of bits (in "bin" or "binUrl"). First sample of WAV is previous bit's clock pulse.
    BITS,
}

const STRING_TO_TEST_TYPE: {[key: string]: TestType} = {
    "pulse": TestType.PULSE,
    "no-pulse": TestType.NO_PULSE,
    "bits": TestType.BITS,
};

/**
 * Individual test to run.
 */
export class Test {
    public readonly name: string;
    public readonly wavUrl: string;
    public readonly type: TestType;
    // If type == BITS, then exactly one of these must be set.
    // Sequence of "0" or "1" characters. Spaces are ignored.
    public readonly bin: string | undefined;
    public readonly binUrl: string | undefined;

    constructor(jsonTest: any) {
        this.name = jsonTest.name;
        this.wavUrl = jsonTest.wavUrl;
        this.type = STRING_TO_TEST_TYPE[jsonTest.type as string];
        this.bin = jsonTest.bin as string;
        this.binUrl = jsonTest.binUrl as string;
    }
}

/**
 * Batch of tests from a file.
 */
export class TestFile {
    public readonly url: string;
    public readonly tests: Test[] = [];
    public readonly includes: string[] = [];

    constructor(url: string, json: any) {
        this.url = url;

        const jsonTests = json.tests as any[];
        if (jsonTests === undefined) {
            throw new Error("file does not have top-level \"tests\" key");
        }

        for (const jsonTest of jsonTests) {
            if (typeof jsonTest === "string") {
                this.includes.push(jsonTest);
            } else {
                this.tests.push(new Test(jsonTest));
            }
        }
    }
}
