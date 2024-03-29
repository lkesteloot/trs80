import {Option, program} from "commander";
import {version} from "./version.js";
import {HexFormat} from "z80-disasm";
import chalk from "chalk";
import {
    BasicLevel,
    basicLevelFromString,
    Config,
    ModelType,
    modelTypeFromString,
} from "trs80-emulator";
import {dir} from "./dir.js";
import {info} from "./info.js";
import { convert } from "./convert.js";
import { sectors } from "./sectors.js";
import { hexdump } from "./hexdump.js";
import { asm } from "./asm.js";
import {disasm} from "./disasm.js";
import { run } from "./run.js";
import { repl } from "./repl.js";
import {BUILD_DATE, BUILD_GIT_HASH} from "./build.js";

const HELP_TEXT = `
See this page for full documentation: https://my-trs-80.com/tool
`

/**
 * Set the chalk color level based on its name. See the --color option.
 * @param levelName
 */
function setColorLevel(levelName: string): void {
    levelName = levelName.toLowerCase();

    switch (levelName) {
        case "auto":
        default:
            // Don't touch the level, let chalk set it.
            break;

        case "off":
            chalk.level = 0;
            break;

        case "16":
            chalk.level = 1;
            break;

        case "256":
            chalk.level = 2;
            break;

        case "16m":
            chalk.level = 3;
            break;
    }
}

function main() {
    const fullVersion = version + " (git " + BUILD_GIT_HASH.substring(0, 7) +
        ", built " + new Date(BUILD_DATE * 1000).toLocaleDateString() + ")";
    program
        .storeOptionsAsProperties(false)
        .name("trs80-tool")
        .addHelpText("after", HELP_TEXT)
        .version(fullVersion)
        .addOption(new Option("--color <color>", "color output")
            .choices(["off", "16", "256", "16m", "auto"])
            .default("auto"));
    program
        .command("dir <infiles...>")
        .description("list files in the infiles", {
            infiles: "WAV, CAS, JV1, JV3, or DMK file (TRSDOS floppies only)",
        })
        .action(infiles => {
            dir(infiles);
        });
    program
        .command("info <infiles...>")
        .description("show information about each file", {
            infile: "any TRS-80 file",
        })
        .option("--verbose", "output more information about each file")
        .action((infiles, options) => {
            info(infiles, options.verbose);
        });
    program
        .command("convert <files...>")
        .description("convert one or more infiles to one outfile", {
            infile: "WAV, CAS, CMD, 3BN, or BAS file",
            outfile: "WAV, CAS, CMD, 3BN, BAS, ASM, or LST file",
        })
        .option("--baud <baud>", "output baud rate (250, 500, 1000, or 1500)")
        .option("--start <address>", "new start address of system program, or \"auto\" to guess")
        .option("--entry <addresses>", "add entry points of binary (comma-separated), for ASM or LST output")
        .action((files, options) => {
            const baud = options.baud !== undefined ? parseInt(options.baud) : undefined;
            const start = options.start !== undefined ? options.start === "auto" ? "auto" : parseInt(options.start) : undefined;
            const entryPoints = options.entry !== undefined ? (options.entry as string).split(",").map(x => parseInt(x)) : [];
            if (files.length < 2) {
                console.log("Must specify at least one infile and exactly one outfile");
                process.exit(1);
            }
            const infiles = files.slice(0, files.length - 1);
            const outfile = files[files.length - 1];
            convert(infiles, outfile, baud, start, entryPoints);
        });
    program
        .command("sectors <infiles...>")
        .description("show a sector map for each floppy file", {
            infile: "any TRS-80 floppy file",
        })
        .option("--contents", "show the contents of the sectors")
        .action((infiles, options) => {
            setColorLevel(program.opts().color);
            for (const infile of infiles) {
                sectors(infile, options.contents);
            }
        });
    program
        .command("hexdump <infile>")
        .description("display an annotated hexdump of infile", {
            infile: "WAV, CAS, CMD, 3BN, BAS, JV1, JV3, or DMK",
        })
        .option("--no-collapse", "collapse consecutive identical lines")
        .action((infile, options) => {
            setColorLevel(program.opts().color);
            hexdump(infile, options.collapse);
        });
    program
        .command("asm <infile> <outfile>")
        .description("assemble a program", {
            infile: "ASM file",
            outfile: "CMD, 3BN, CAS, WAV, BIN, or HEX file",
        })
        .option("--baud <baud>", "baud rate for CAS and WAV file (250, 500, 1000, 1500), defaults to 500")
        .option("--listing <filename>", "generate listing file")
        .action((infile, outfile, options) => {
            setColorLevel(program.opts().color);
            const baud = options.baud === undefined ? 500 : parseInt(options.baud);
            if (baud !== 250 && baud !== 500 && baud !== 1000 && baud !== 1500) {
                console.log("Invalid baud rate: " + options.baud);
                process.exit(1);
            }
            asm(infile, outfile, baud, options.listing);
        });
    program
        .command("disasm <infile>")
        .description("disassemble a program", {
            infile: "CMD, 3BN, ROM, or BIN",
        })
        .option("--listing", "generate listing file instead of assembly")
        .option('--org <address>', "where to assume the binary is loaded")
        .option("--entry <addresses>", "add entry points of binary (comma-separated)")
        .option("--no-labels", "do not generate labels for jump targets")
        .option("--no-known", "do not use labels for known ROM locations")
        .option("--no-binary", "do not show program binary in listing")
        .option("--upper", "generate upper case output")
        .option("--hex-format <format>", "format for hex numbers: c for 0x12, dollar for $12, and h for 12h",
            "c")
        .action((infile, options) => {
            setColorLevel(program.opts().color);
            const org = options.org === undefined ? undefined : parseInt(options.org);
            const entryPoints = options.entry !== undefined ? (options.entry as string).split(",").map(x => parseInt(x)) : [];
            const hexFormatString = options.hexFormat as string;
            if (hexFormatString !== "c" && hexFormatString !== "dollar" && hexFormatString !== "h") {
                console.log("Invalid hex format: " + hexFormatString);
                process.exit(1);
            }
            const hexFormat = hexFormatString === "c" ? HexFormat.C : hexFormatString === "dollar" ? HexFormat.DOLLAR : HexFormat.H;
            disasm(infile, options.listing, org, entryPoints, options.labels, options.known, options.binary, hexFormat,
                options.upper);
        });
    program
        .command("run [program]")
        .description("run a TRS-80 emulator", {
            program: "optional program file to run"
        })
        .option("--xray", "run an xray debug server")
        .option("--model <model>", "which model (1, 3, 4), defaults to 3")
        .option("--level <level>", "which level (1 or 2), defaults to 2")
        .option("--mount <files...>", "cassettes or floppies to mount")
        .option("--printer <file>", "send printer output to the specified file")
        .action((program, options) => {
            const modelName = options.model ?? "3";
            const levelName = options.level ?? "2";
            const printerPathname = options.printer ?? undefined;

            const modelType = modelTypeFromString(modelName);
            if (modelType === undefined) {
                console.log("Invalid model: " + modelName);
                process.exit(1);
            }
            const basicLevel = basicLevelFromString(levelName);
            if (basicLevel === undefined) {
                console.log("Invalid Basic level: " + levelName);
                process.exit(1);
            }

            if (basicLevel === BasicLevel.LEVEL1 && modelType !== ModelType.MODEL1) {
                console.log("Can only run Level 1 Basic with Model I");
                process.exit(1);
            }

            const config = Config.makeDefault()
                .edit()
                .withModelType(modelType)
                .withBasicLevel(basicLevel)
                .build();
            if (!config.isValid()) {
                // Kinda generic!
                console.log("Invalid model and Basic level configuration");
                process.exit(1);
            }

            run(program, options.mount ?? [], options.xray, config, printerPathname);
        });
    program
        .command("repl")
        .description("interactive prompt for exploring the Z80")
        .action(() => {
            repl();
        });
    program
        .parse();
}

main();
