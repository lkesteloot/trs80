
export function toHex(value: number, digits: number): string {
    let s = value.toString(16).toUpperCase();

    while (s.length < digits) {
        s = "0" + s;
    }

    return s;
}

export function hi(value: number): number {
    return (value >> 8) & 0xFF;
}

export function lo(value: number): number {
    return value & 0xFF;
}

export function word(hi: number, lo: number): number {
    return ((hi & 0xFF) << 8) | (lo & 0xFF);
}

export function inc8(value: number): number {
    return add8(value, 1);
}

export function inc16(value: number): number {
    return add16(value, 1);
}

export function dec8(value: number): number {
    return add8(value, -1);
}

export function dec16(value: number): number {
    return add16(value, -1);
}

export function add8(a: number, b: number): number {
    return (a + b) & 0xFF;
}

export function add16(a: number, b: number): number {
    return (a + b) & 0xFFFF;
}

export function signedByte(value: number): number {
    return value >= 128 ? value - 256 : value;
}