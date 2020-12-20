
import sys

FG = [122, 244, 96]
BG = [0, 0, 0]
TRANSPARENT = [0, 0, 255]
ERROR = [255, 0, 0]

def main():
    sys.stdout.write("P3\n64 64 255\n")

    for line in sys.stdin:
        for i in range(2):
            for ch in line.strip():
                if ch == "*":
                    color = FG
                elif ch == ".":
                    color = BG
                elif ch == " ":
                    color = TRANSPARENT
                else:
                    sys.stderr.write("Unknown character \"" + ch + "\"\n")
                    color = ERROR

                sys.stdout.write("%d %d %d " % tuple(color))

main()
