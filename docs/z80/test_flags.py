
# Test the difference between the carry flag and the minus flag.

# Takes a two's complement 8-bit value and returns the integer value of it.
def tc(x):
    return x if x < 128 else x - 256

def add(a, b):
    a &= 0xFF
    b &= 0xFF
    result = a + b
    carry = (result & 0x100) != 0
    minus = (result & 0x80) != 0
    result &= 0xFF
    return ("%02X + %02X = %02X" % (a, b, result), result, carry, minus)

def sub(a, b):
    a &= 0xFF
    b &= 0xFF
    result = a - b
    carry = (result & 0x100) != 0
    minus = (result & 0x80) != 0
    result &= 0xFF
    return ("%02X - %02X = %02X" % (a, b, result), result, carry, minus)

print(add(5, 6)) # Easy case.
print(add(70, 70))
print(add(127, 127))
print(add(130, 130))
print("---")
print(sub(6, 5))
print(sub(5, 6))
print(sub(-6, -5))
print(sub(-120, 120))
for a in range(0, 256, 16):
    for b in range(0, 256, 16):
        (s, _, carry, minus) = sub(a, b)
        if carry != minus:
            print(s, carry, minus, a < b, tc(a) < tc(b))

