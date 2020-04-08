
# Converts the HTML of http://clrhome.org/table/ to a JSON file.
# Run with python3.

import sys
import re
import json

# <table title="ED">
TABLE_RE = re.compile(r'^<table title="(.*)">$')
# <th>0</th>
HIGH_NYBBLE_RE = re.compile(r'^<th>(.*)</th>$')
# <td class="un" axis="++V+++|2|8|The contents of a are negated (two's complement). Operation is the same as subtracting a from zero.">neg</td>
INST_RE = re.compile(r'^<td (class="un" |)axis="(.*)">(.*)</td>$')

opcode_prefix = None
high_nybble = None
low_nybble = None

instructions = []

for line in open(sys.argv[1]):
    line = line.strip()

    m = TABLE_RE.match(line)
    if m:
        opcode_prefix = m.group(1)
        # print(opcode_prefix)
    else:
        m = HIGH_NYBBLE_RE.match(line)
        if m:
            high_nybble = int(m.group(1), 16)
            low_nybble = 0
            # print(high_nybble)
        else:
            m = INST_RE.match(line)
            if m:
                undocumented = m.group(1) != ""
                info = m.group(2).split("|")
                if len(info) != 4:
                    sys.stderr.write("Bad number of fields: " + line + "\n")
                    sys.exit(1)
                flags, byte_count, clock_count, description = info
                instruction = m.group(3)

                opcode = "%02X" % (high_nybble*16 + low_nybble)
                opcodes = opcode_prefix + opcode
                if "/" in clock_count:
                    with_jump_clock_count, without_jump_clock_count = map(int, clock_count.split("/"))
                    sys.stderr.write(clock_count + " " + instruction + "\n")
                else:
                    with_jump_clock_count = int(clock_count)
                    without_jump_clock_count = with_jump_clock_count

                instructions.append({
                    "opcodes": opcodes,
                    "undocumented": undocumented,
                    "flags": flags,
                    "byte_count": int(byte_count),
                    "with_jump_clock_count": with_jump_clock_count,
                    "without_jump_clock_count": without_jump_clock_count,
                    "description": description,
                    "instruction": instruction,
                })
                # print(opcodes, undocumented, flags, byte_count, clock_count, description, instruction)
    if line.startswith("<td") and low_nybble is not None:
        low_nybble += 1

data = {
    "instructions": instructions,
}
json.dump(data, sys.stdout, indent=4)
