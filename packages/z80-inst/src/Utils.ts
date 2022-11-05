

/**
 * Some instructions are four bytes long but the data byte is in the third
 * byte, like DDCB1247, where 12 is the data byte.
 * @param b1 First byte.
 * @param b2 Second byte.
 * @returns Whether the data byte is the third byte. If not, then it's the
 * last byte (whatever that is).
 */
export function isDataThirdByte(b1: number, b2: number): boolean {
    return (b1 === 0xDD || b1 === 0xFD) && b2 === 0xCB;
}
