
export function toHex(value: number, digits: number): string {
    let s = value.toString(16);

    while (s.length < digits) {
        s = "0" + s;
    }

    return s;
}
