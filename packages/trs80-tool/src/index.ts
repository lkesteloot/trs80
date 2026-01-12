import fs from "fs";
import {Option, program} from "commander";
import {version} from "./version.js";
import {HexFormat} from "z80-disasm";
import chalk from "chalk";
import {BasicLevel, basicLevelFromString, Config, ModelType, modelTypeFromString,} from "trs80-emulator";
import {dir} from "./dir.js";
import {info} from "./info.js";
import {convert} from "./convert.js";
import {sectors} from "./sectors.js";
import {hexdump} from "./hexdump.js";
import {asm} from "./asm.js";
import {disasm} from "./disasm.js";
import {run} from "./run.js";
import {repl} from "./repl.js";
import {BUILD_DATE, BUILD_GIT_HASH} from "./build.js";
import {mount} from "./mount.js";
import {LogLevel, LogSink, TRS80_MAIN_SINK, TRS80_MODULE_NAME_TO_LOGGER} from "trs80-logger";
import { CassetteSpeed } from "trs80-base";

const HELP_TEXT = `
See this page for full documentation: https://my-trs-80.com/tool
`

/**
 * Set the chalk color level based on its name. See the --color option.
 * @param levelName
 */
function setColorLevel(levelName: string): void {
    switch (levelName.toLowerCase()) {
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

/**
 * Sink that uses "chalk" to write colored text to the console.
 */
const COLORED_SINK = (level: LogLevel, message: string): void => {
    switch (level) {
        case LogLevel.TRACE:
            console.log(chalk.gray(message));
            break;

        case LogLevel.INFO:
            console.log(chalk.green(message));
            break;

        case LogLevel.WARN:
            console.log(chalk.yellow(message));
            break;
    }
};

/**
 * Make a log sink that writes to a file.
 */
function makeFileLogSink(pathname: string): LogSink {
    const fd = fs.openSync(pathname, "w");

    return (level: LogLevel, message: string): void => {
        const now = new Date();
        const hour = now.getHours().toString().padStart(2, "0");
        const minute = now.getMinutes().toString().padStart(2, "0");
        const second = now.getSeconds().toString().padStart(2, "0");
        const millisecond = now.getMilliseconds().toString().padStart(3, "0");
        const timestamp = `${hour}:${minute}:${second}.${millisecond}`;

        let label: string;
        switch (level) {
            case LogLevel.TRACE:
                label = "TRACE";
                break;

            case LogLevel.INFO:
                label = "INFO";
                break;

            case LogLevel.WARN:
                label = "WARN";
                break;
        }
        label = label.padEnd(5, " ");

        fs.writeSync(fd, `${timestamp} ${label} ${message}\n`);
    };
}

/**
 * Parse a baud rate string into a speed.
 */
function parseBaud(baudString: string | undefined): CassetteSpeed | undefined {
    if (baudString === undefined) {
        return undefined;
    }
    const baud = parseInt(baudString);
    const speed = CassetteSpeed.fromNominalBaud(baud);
    if (speed === undefined) {
        console.log("Baud rate must be 250, 500, or 1500: " + baud);
        process.exit(1);
    }

    return speed;
}

function main() {
    TRS80_MAIN_SINK.delegatedSinks.splice(0);
    // Important that this is first, we might replace it in the run() command. Don't use
    // a batching sink for the terminal, since it won't have a chance to flush its last line.
    TRS80_MAIN_SINK.delegatedSinks.push(COLORED_SINK);

    const fullVersion = version + " (git " + BUILD_GIT_HASH.substring(0, 7) +
        ", built " + new Date(BUILD_DATE * 1000).toLocaleDateString() + ")";
    program
        .storeOptionsAsProperties(false)
        .name("trs80-tool")
        .addHelpText("after", HELP_TEXT)
        .version(fullVersion)
        .addOption(new Option("--color <color>", "color output")
            .choices(["off", "16", "256", "16m", "auto"])
            .default("auto")
            .argParser(setColorLevel))
        .addOption(new Option("--trace <module>", "show trace logs for module")
            .choices(Object.keys(TRS80_MODULE_NAME_TO_LOGGER).sort())
            .argParser(moduleName => {
                const moduleLogger = TRS80_MODULE_NAME_TO_LOGGER[moduleName];
                if (moduleLogger === undefined) {
                    console.log("Unknown logger module: " + moduleName);
                    process.exit(1);
                }
                moduleLogger.minLevel = LogLevel.TRACE;
            }))
        .addOption(new Option("--log-file <pathname>", "write logs to the specified file")
            .argParser(pathname => {
                TRS80_MAIN_SINK.delegatedSinks.push(makeFileLogSink(pathname));
            }));
    program
        .command("dir <infiles...>")
        .description("list files in the infiles", {
            infiles: "WAV, CAS, JV1, JV3, or DMK file (TRSDOS floppies only)",
        })
        .option("--system", "include floppy system files")
        .action((infiles, options) => {
            dir(infiles, options.system);
        });
    program
        .command("info <infiles...>")
        .description("show information about each file", {
            infiles: "any TRS-80 files",
        })
        .option("--verbose", "output more information about each file")
        .action((infiles, options) => {
            info(infiles, options.verbose);
        });
    program
        .command("convert <files...>")
        .description("convert one or more infiles to one outfile", {
            infile: "WAV, CAS, CMD, 3BN, or BAS file", // TODO these aren't used.
            outfile: "WAV, CAS, CMD, 3BN, BAS, ASM, or LST file",
        })
        .option("--baud <baud>", "output baud rate (250, 500, or 1500)")
        .option("--start <address>", "new start address of system program, or \"auto\" to guess")
        .option("--entry <addresses>", "add entry points of binary (comma-separated), for ASM or LST output")
        .action((files, options) => {
            const speed = parseBaud(options.baud);
            const start = options.start !== undefined ? options.start === "auto" ? "auto" : parseInt(options.start) : undefined;
            const entryPoints = options.entry !== undefined ? (options.entry as string).split(",").map(x => parseInt(x)) : [];
            if (files.length < 2) {
                console.log("Must specify at least one infile and exactly one outfile");
                process.exit(1);
            }
            const infiles = files.slice(0, files.length - 1);
            const outfile = files[files.length - 1];
            convert(infiles, outfile, speed, start, entryPoints);
        });
    if (2 > 3) {
        program
            .command("mount <diskfile> [commands...]")
            .description("mount a floppy file and perform operations on it", {
                diskfile: "JV1, JV3, DMK, or DSK file",
                commands: "import FILE [as FILE], export FILE [as FILE], delete FILE, rename FILE to FILE"
            })
            .action((diskfile, commands, options) => {
                mount(diskfile, commands);
            });
    }
    program
        .command("sectors <infiles...>")
        .description("show a sector map for each floppy file", {
            infiles: "any TRS-80 floppy files",
        })
        .option("--contents", "show the contents of the sectors")
        .option("--bad", "show only the bad sectors and their files")
        .action((infiles, options) => {
            for (const infile of infiles) {
                sectors(infile, options.contents, options.bad);
            }
        });
    program
        .command("hexdump <infile>")
        .description("display an annotated hexdump of infile", {
            infile: "WAV, CAS, CMD, 3BN, BAS, JV1, JV3, or DMK",
        })
        .option("--no-collapse", "collapse consecutive identical lines")
        .action((infile, options) => {
            hexdump(infile, options.collapse);
        });
    program
        .command("asm <infile> <outfile>")
        .description("assemble a program", {
            infile: "ASM file",
            outfile: "CMD, 3BN, CAS, WAV, BIN, or HEX file",
        })
        .option("--baud <baud>", "baud rate for CAS and WAV file (250, 500, 1500), defaults to 500")
        .option("--listing <filename>", "generate listing file")
        .action((infile, outfile, options) => {
            const speed = parseBaud(options.baud) ?? CassetteSpeed.LOW;
            asm(infile, outfile, speed, options.listing);
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
        .option("--write-protected", "write-protect mounted floppies")
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

            run(program, options.mount ?? [], options.xray, options.writeProtected, config, printerPathname);
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
