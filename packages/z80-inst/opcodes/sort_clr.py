
# Sorts (via stdio) a "clr.json" file, to more easily compare two versions.

import sys
import json

# The particular change I wanted to see had different flags.
def remove_flags(o):
    del o["flags"]
    return o

data = json.load(sys.stdin)

data["instructions"] = sorted(data["instructions"], key=lambda o: o["opcodes"])
data["instructions"] = [remove_flags(o) for o in data["instructions"] if not o["z180"]]

json.dump(data, sys.stdout, indent=4)

