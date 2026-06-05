
# Converts the HTML of http://clrhome.org/table/ to a JSON file.
#
# curl -o clr.html https://clrhome.org/table/
# python3 clr2json.py clr.html > clr.json

import sys
import re
import json

# <td   class="undocumented"  >  
TD_RE = re.compile(r'<td\s+(?:class="(\w+)")?\s+>')

# <var>nn</var>
VAR_RE = re.compile(r'<var>(\w+)</var>')

# dd
DD_RE = re.compile(r'\bdd\b')

# Strip out the <dd>...</dd> HTML tags.
def strip_dd(line):
    line = line.strip()
    assert line.startswith("<dd>") and line.endswith("</dd>")
    return line[4:-5]

# Strip the <var>...</var> HTML tags and their content.
def strip_vars(line):
    return re.sub(r'<var>\w+</var>', "", line)

# Replace <var>d</var> with <var>dd</var>, duplicating the content so that the
# variable "d" is not confused with register D.
def duplicate_vars(line):
    return VAR_RE.sub(r'<var>\1\1</var>', line)

# Replace <var>d</var> with dd, stripping the markup and duplicating the
# content, so that the variable "d" is not confused with register D.
def duplicate_vars_and_strip(line):
    return VAR_RE.sub(r'\1\1', line)

FLAG_MAP = {
    "as defined": "+",
    "exceptional": "*",
    "detects overflow": "V",
    "reset": "0",
    "set": "1",
    "unaffected": "-",
    "undefined": " ",
    "detects parity": "P",
}

# <dd>as defined</dd>
def convert_flag(line):
    global FLAG_MAP
    line = strip_dd(line)
    return FLAG_MAP[line]

instructions = []

lines = list(open(sys.argv[1]).readlines())

z80_count = 0

n = 0
while n < len(lines):
    line = lines[n]
    m = TD_RE.search(line)
    if m and "</td" not in line:
        undocumented = m.group(1) == "undocumented"
        z180 = m.group(1) == "z180"
        flags = ""
        n += 1
        # inc d
        line = lines[n].strip()
        if line.startswith("<a"):
            continue
        instruction = lines[n].strip().replace("<code>", "").replace("</code>", "")
        instruction = duplicate_vars_and_strip(instruction)
        n += 1
        # <dl>
        assert lines[n].strip() == "<dl>"
        n += 1
        # <dt>Opcode</dt>
        assert lines[n].strip() == "<dt>Opcode</dt>"
        n += 1
        # <dd>  DD  14  </dd>
        opcodes = strip_vars(strip_dd(lines[n]).replace(" ", "")).replace("-$-2", "")
        n += 1
        # <dt>Bytes</dt>
        assert lines[n].strip() == "<dt>Bytes</dt>"
        n += 1
        # <dd>2</dd>
        byte_count = int(strip_dd(lines[n]))
        n += 1
        # <dt>Cycles</dt>
        assert lines[n].strip() == "<dt>Cycles</dt>"
        n += 1
        # <dd>8</dd>
        clock_count = strip_dd(lines[n])
        if "/" in clock_count:
            with_jump_clock_count, without_jump_clock_count = map(int, clock_count.split("/"))
        else:
            with_jump_clock_count = int(clock_count)
            without_jump_clock_count = with_jump_clock_count
        n += 1
        # <dt>C</dt>
        assert lines[n].strip() == "<dt>C</dt>"
        n += 1
        # <dd>unaffected</dd>
        flags += convert_flag(lines[n])
        n += 1
        # <dt>N</dt>
        assert lines[n].strip() == "<dt>N</dt>"
        n += 1
        # <dd>as defined</dd>
        flags += convert_flag(lines[n])
        n += 1
        # <dt>P/V</dt>
        assert lines[n].strip() == "<dt>P/V</dt>"
        n += 1
        # <dd>detects overflow</dd>
        flags += convert_flag(lines[n])
        n += 1
        # <dt>H</dt>
        assert lines[n].strip() == "<dt>H</dt>"
        n += 1
        # <dd>as defined</dd>
        flags += convert_flag(lines[n])
        n += 1
        # <dt>Z</dt>
        assert lines[n].strip() == "<dt>Z</dt>"
        n += 1
        # <dd>as defined</dd>
        flags += convert_flag(lines[n])
        n += 1
        # <dt>S</dt>
        assert lines[n].strip() == "<dt>S</dt>"
        n += 1
        # <dd>as defined</dd>
        flags += convert_flag(lines[n])
        n += 1
        # <dd>Adds one to r.</dd>
        description = duplicate_vars(strip_dd(lines[n]).strip())
        n += 1
        # </dl>

        # Replace "dd" with "offset" for relative jumps.
        parts = instruction.split(" ")
        mnemonic = parts[0]
        if mnemonic in ["jr", "djnz"]:
            description = DD_RE.sub("offset", description)
            instruction = DD_RE.sub("offset", instruction)

        # Strip "h" from RST.
        if mnemonic == "rst":
            if instruction.endswith("h"):
                instruction = instruction[:-1]
            else:
                sys.stderr.write("RST does not end with h: " + instruction)

        instructions.append({
            "opcodes": opcodes,
            "undocumented": undocumented,
            "z180": z180,
            "flags": flags,
            "byte_count": byte_count,
            "with_jump_clock_count": with_jump_clock_count,
            "without_jump_clock_count": without_jump_clock_count,
            "description": description,
            "instruction": instruction,
        })

        if not z180:
            z80_count += 1
    else:
        n += 1

data = {
    "instructions": instructions,
}
json.dump(data, sys.stdout, indent=4)
sys.stderr.write("Number of instructions: %d (%d Z80)\n" % (len(instructions), z80_count))
