
export enum TestType {
    PULSE,
    NO_PULSE,
    BITS,
}

const STRING_TO_TEST_TYPE: {[key: string]: TestType} = {
    "pulse": TestType.PULSE,
    "no-pulse": TestType.NO_PULSE,
    "bits": TestType.BITS,
};

export class Test {
    public readonly wavUrl: string;
    public readonly type: TestType;
    public readonly bin: string | undefined;
    public readonly binUrl: string | undefined;

    constructor(jsonTest: any) {
        this.wavUrl = jsonTest.wavUrl;
        this.type = STRING_TO_TEST_TYPE[jsonTest.type as string];
        this.bin = jsonTest.bin as string;
        this.binUrl = jsonTest.binUrl as string;
    }
}

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
