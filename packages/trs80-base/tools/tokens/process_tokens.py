
import sys

commands = []

while True:
    name = sys.stdin.readline().strip()
    if name == "":
        break
    token = int(sys.stdin.readline().strip(), 16)
    address = sys.stdin.readline().strip()
    address = int(address, 16) if address != "———" else None
    commands.append((name, token, address))

print("// Automatically generated from process_tokens.py. Do not modify.")
print()

print("export interface BasicToken {")
print("    // Name or symbol of the Basic token.")
print("    name: string;")
print("    // Tokenized byte.")
print("    token: number;")
print("    // Address in ROM of routine to handle token, if any.")
print("    address: number | undefined;")
print("}")
print()
print("export const TRS80_MODEL_III_BASIC_TOKENS: BasicToken[] = [")
for name, token, address in commands:
    # Some addresses are above this limit, but that's above the ROM file size,
    # so these may be disk routines or errors.
    if address is None or address < 14336:
        print("    { name: \"%s\", token: 0x%02x, address: %s }," %
                (name, token, "0x%04x" % address if address != None else "undefined"))
print("];")
