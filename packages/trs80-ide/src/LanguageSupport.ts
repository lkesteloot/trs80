/*
const nodeTypes = [
    NodeType.define({
        id: 0,
        name: "file",
    }),
    NodeType.define({
        id: 1,
        name: "line",
    }),
];

class Xyz implements PartialParse {
    input: Input;

    constructor(input: Input) {
        this.input = input;
    }

    advance(): Tree | null {
        const code = this.input.read(0, this.input.length).split("\n");
        const {sourceFile} = assemble(code);

        const lines: Tree[] = [];
        const positions: number[] = [];
        let pos = 0;

        for (let i = 0; i < sourceFile.assembledLines.length; i++) {
            lines.push(new Tree(nodeTypes[1], [], [], length));
            positions.push(pos);
            pos += code[i].length + 1;
        }

        return new Tree(nodeTypes[0], lines, positions, length);
    }

    parsedPos: number = 0;

    stopAt(pos: number): void {
        throw new Error("Method not implemented.")
    }

    stoppedAt: number | null = null;
}

class Z80AssemblyParser extends Parser {
    createParse(input: Input,
                fragments: readonly TreeFragment[],
                ranges: readonly { from: number; to: number }[]): PartialParse {

        return new Xyz(input);
    }
}

const parser = new Z80AssemblyParser();

const language = new Language(
    defineLanguageFacet(),
    parser,
    nodeTypes[1]
);

function z80AssemblyLanguage() {
    return new LanguageSupport(language, []);
}
 */
