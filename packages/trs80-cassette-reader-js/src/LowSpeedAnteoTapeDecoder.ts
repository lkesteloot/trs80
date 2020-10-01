
// Low speed tape decode based on anteo's version.
// https://github.com/anteo

import {TapeDecoder} from "./TapeDecoder";
import {Tape} from "./Tape";
import {TapeDecoderState} from "./TapeDecoderState";
import {BitData} from "./BitData";
import {ByteData} from "./ByteData";
import {Program} from "./Program";

enum AnteoState {
    DETECTING_PULSE_DISTANCE,
    PROOF_PULSE_DISTANCE,
    DECODING_DATA,
}

export class LowSpeedAnteoTapeDecoder implements TapeDecoder {
    private readonly tape: Tape;
    private anteoState: AnteoState = AnteoState.DETECTING_PULSE_DISTANCE;
    private state: TapeDecoderState = TapeDecoderState.UNDECIDED;

    constructor(tape: Tape) {
        this.tape = tape;
    }

    public findNextProgram(startFrame: number): Program | undefined {
        throw new Error("Method not implemented.");
    }

    private handleSample(frame: number): void {
        switch (this.anteoState) {
            case AnteoState.DETECTING_PULSE_DISTANCE:
                //this.detectPulseDistance(frame);
                break;
            case AnteoState.PROOF_PULSE_DISTANCE:
                break;
            case AnteoState.DECODING_DATA:
                break;
        }
    }

    getBinary(): Uint8Array {
        return new Uint8Array(0);
    }

    getBitData(): BitData[] {
        return [];
    }

    getByteData(): ByteData[] {
        return [];
    }

    getName(): string {
        return "Low speed (Anteo)";
    }

    getState(): TapeDecoderState {
        return this.state;
    }

}
