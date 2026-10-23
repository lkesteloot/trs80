import fs from "fs";
import {Option, program} from "commander";
import {version} from "./version.js";
import {HexFormat} from "z80-disasm";
import {colors, honorNoColor, setColorLevel} from "./colors.js";
import {BasicLevel, basicLevelFromString, Config, ModelType, modelTypeFromString,} from "trs80-emulator";
import {dir} from "./dir.js";
import {info} from "./info.js";
import {convert} from "./convert.js";
import {extract, extractJson} from "./extract.js";
import {sectors, sectorsJson} from "./sectors.js";
import {hexdump} from "./hexdump.js";
import {asm} from "./asm.js";
import {disasm} from "./disasm.js";
import {run} from "./run.js";
import {repl} from "./repl.js";
import {mcp} from "./mcp.js";
import {BUILD_DATE, BUILD_GIT_HASH} from "./build.js";
import {mount} from "./mount.js";
import {LogLevel, LogSink, MAIN_SINK, MODULE_NAME_TO_LOGGER} from "z80-logger";
import { CassetteSpeed } from "trs80-base";
import {ToolError} from "./utils.js";
import {PagerClosedError, pagerYield, startPager, stopPager} from "./pager.js";

const HELP_TEXT = `
See this page for full documentation: https://my-trs-80.com/tool
`

/**
 * Sink that writes colored text to the console.
 */
const COLORED_SINK = (level: LogLevel, message: string): void => {
    switch (level) {
        case LogLevel.TRACE:
            console.log(colors.muted(message));
            break;

        case LogLevel.INFO:
            console.log(colors.info(message));
            break;

        case LogLevel.WARN:
            console.log(colors.warning(message));
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
 * Wrap a command's action so that its output goes to a pager, unless the user
 * turned that off with --no-pager. See pager.ts.
 */
function paged<T extends any[]>(action: (...args: T) => void | Promise<void>): (...args: T) => Promise<void> {
    return async (...args: T) => {
        if (program.opts().pager) {
            startPager();
        }
        await action(...args);
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
        throw new ToolError("Baud rate must be 250, 500, or 1500: " + baud);
    }

    return speed;
}

async function main(): Promise<void> {
    honorNoColor();

    MAIN_SINK.delegatedSinks.splice(0);
    // Important that this is first, we might replace it in the run() command. Don't use
    // a batching sink for the terminal, since it won't have a chance to flush its last line.
    MAIN_SINK.delegatedSinks.push(COLORED_SINK);

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
            .choices(Object.keys(MODULE_NAME_TO_LOGGER).sort())
            .argParser(moduleName => {
                const moduleLogger = MODULE_NAME_TO_LOGGER[moduleName];
                if (moduleLogger === undefined) {
                    throw new ToolError("Unknown logger module: " + moduleName);
                }
                moduleLogger.minLevel = LogLevel.TRACE;
            }))
        .addOption(new Option("--log-file <pathname>", "write logs to the specified file")
            .argParser(pathname => {
                MAIN_SINK.delegatedSinks.push(makeFileLogSink(pathname));
            }))
        .option("--no-pager", "don't send output to a pager");
    program
        .command("dir <infiles...>")
        .description("list files in the infiles", {
            infiles: "WAV, CAS, JV1, JV3, DMK, HFE, IMD, or HDV file (TRSDOS floppies and hard disks only)",
        })
        .option("--system", "include floppy system files")
        .option("--cpm-records", "keep CP/M files' whole 128-byte records instead of ending text files at Ctrl-Z")
        .option("--json", "output one JSON object for all the infiles instead of text")
        .action(paged(async (infiles, options) => {
            await dir(infiles, options.system ?? false, options.cpmRecords ?? false, options.json ?? false);
        }));
    program
        .command("info <infiles...>")
        .description("show information about each file", {
            infiles: "any TRS-80 files",
        })
        .option("--verbose", "output more information about each file")
        .option("--json", "output one JSON object for all the infiles instead of text")
        .addOption(new Option("--report", "output a detailed JSON report, for regression testing").hideHelp())
        .action(paged(async (infiles, options) => {
            await info(infiles, options.verbose ?? false, options.json ?? false, options.report ?? false);
        }));
    program
        .command("convert <files...>")
        .description("convert one or more infiles to one outfile", {
            infile: "WAV, CAS, CMD, 3BN, or BAS file", // TODO these aren't used.
            outfile: "WAV, CAS, CMD, 3BN, BAS, or ASC file",
        })
        .option("--baud <baud>", "output baud rate (250, 500, or 1500)")
        .option("--start <address>", "new start address of system program, or \"auto\" to guess")
        .option("--system", "include system files from source floppies")
        .option("--cpm-records", "keep CP/M files' whole 128-byte records instead of ending text files at Ctrl-Z")
        .action((files, options) => {
            const speed = parseBaud(options.baud);
            const start = options.start !== undefined ? options.start === "auto" ? "auto" : parseInt(options.start) : undefined;
            const includeSystemFiles = options.system;
            if (files.length < 2) {
                throw new ToolError("Must specify at least one infile and exactly one outfile");
            }
            const infiles = files.slice(0, files.length - 1);
            const outfile = files[files.length - 1];
            convert(infiles, outfile, speed, start, includeSystemFiles, options.cpmRecords);
        });
    program
        .command("extract <infile> [outdir]")
        .description("extract the files in a floppy, hard disk, CAS, or WAV file into an existing directory", {
            infile: "floppy (JV1, JV3, DMK, DSK, HFE, IMD, SCP), hard disk (HDV), CAS, or WAV file",
            outdir: "existing directory (leave out with --json)",
        })
        .option("--system", "include system files from the floppy")
        .option("--cpm-records", "keep CP/M files' whole 128-byte records instead of ending text files at Ctrl-Z")
        .option("--ucsd-pascal-raw", "keep UCSD Pascal text files as they are on the disk instead of converting them to host text")
        .option("--mark-damaged", "add \"[DAMAGED]\" to the name of files with unreadable sectors or other damage")
        .option("--lowercase", "write the files with lowercase names")
        .option("--json", "write one JSON object, with the files' contents in base64, to standard output instead of writing files")
        .action((infile, outdir, options) => {
            if (options.json) {
                if (outdir !== undefined) {
                    throw new ToolError("Leave out the output directory with --json, which prints to standard output");
                }
                if (options.ucsdPascalRaw) {
                    throw new ToolError("--json can't be used with --ucsd-pascal-raw: the JSON has both versions of text files");
                }
                extractJson(infile, options.system ?? false, options.cpmRecords ?? false,
                    options.markDamaged ?? false, options.lowercase ?? false);
            } else {
                if (outdir === undefined) {
                    throw new ToolError("Must specify an output directory");
                }
                extract(infile, outdir, options.system ?? false, options.cpmRecords ?? false,
                    options.ucsdPascalRaw ?? false, options.markDamaged ?? false, options.lowercase ?? false);
            }
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
        .option("--json", "output one JSON object for all the infiles instead of text")
        .action(paged(async (infiles, options) => {
            if (options.json) {
                sectorsJson(infiles, options.contents ?? false, options.bad ?? false);
            } else {
                for (const infile of infiles) {
                    sectors(infile, options.contents, options.bad);
                    await pagerYield();
                }
            }
        }));
    program
        .command("hexdump <infile>")
        .description("display an annotated hexdump of infile", {
            infile: "WAV, CAS, CMD, 3BN, BAS, JV1, JV3, DMK, HFE, or IMD",
        })
        .option("--no-collapse", "collapse consecutive identical lines")
        .action(paged((infile, options) => {
            hexdump(infile, options.collapse);
        }));
    program
        .command("asm <infile> <outfile>")
        .description("assemble a program", {
            infile: "ASM file",
            outfile: "CMD, 3BN, CAS, WAV, BIN, or HEX file",
        })
        .option("--baud <baud>", "baud rate for CAS and WAV file (250, 500, 1500), defaults to 500")
        .option("--listing <filename>", "generate listing file")
        .option("--model <model>", "which model (1, 3, 4), defaults to 3")
        .action((infile, outfile, options) => {
            const speed = parseBaud(options.baud) ?? CassetteSpeed.LOW;
            const modelName = options.model ?? "3";
            const modelType = modelTypeFromString(modelName);
            if (modelType === undefined) {
                throw new ToolError("Invalid model: " + modelName);
            }
            asm(infile, outfile, speed, options.listing, modelType);
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
        .option("--full", "assume there are only instructions")
        .option("--data-comment", "add comments for each instruction as ASCII")
        .option("--hex-format <format>", "format for hex numbers: c for 0x12, dollar for $12, and h for 12h",
            "c")
        .action(paged((infile, options) => {
            const org = options.org === undefined ? undefined : parseInt(options.org);
            const entryPoints = options.entry !== undefined ? (options.entry as string).split(",").map(x => parseInt(x)) : [];
            const hexFormatString = options.hexFormat as string;
            if (hexFormatString !== "c" && hexFormatString !== "dollar" && hexFormatString !== "h") {
                throw new ToolError("Invalid hex format: " + hexFormatString);
            }
            const hexFormat = hexFormatString === "c" ? HexFormat.C : hexFormatString === "dollar" ? HexFormat.DOLLAR : HexFormat.H;
            disasm(infile, options.listing, org, entryPoints, options.labels, options.known, options.binary, hexFormat,
                options.upper, options.full, options.dataComment);
        }));
    program
        .command("mcp")
        .description("run an MCP server on stdio, for driving the emulator from an AI assistant")
        .action(() => {
            mcp();
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
        .option("--writable", "let the emulator write to floppies, saving changes to their files")
        .option("--printer <file>", "send printer output to the specified file")
        .action((program, options) => {
            const modelName = options.model ?? "3";
            const levelName = options.level ?? "2";
            const printerPathname = options.printer ?? undefined;

            const modelType = modelTypeFromString(modelName);
            if (modelType === undefined) {
                throw new ToolError("Invalid model: " + modelName);
            }
            const basicLevel = basicLevelFromString(levelName);
            if (basicLevel === undefined) {
                throw new ToolError("Invalid Basic level: " + levelName);
            }

            if (basicLevel === BasicLevel.LEVEL1 && modelType !== ModelType.MODEL1) {
                throw new ToolError("Can only run Level 1 Basic with Model I");
            }

            const config = Config.makeDefault()
                .edit()
                .withModelType(modelType)
                .withBasicLevel(basicLevel)
                .build();
            if (!config.isValid()) {
                // Kinda generic!
                throw new ToolError("Invalid model and Basic level configuration");
            }

            run(program, options.mount ?? [], options.xray, options.writable ?? false, config, printerPathname);
        });
    program
        .command("repl")
        .description("interactive prompt for exploring the Z80")
        .action(() => {
            repl();
        });

    let error: unknown = undefined;
    try {
        await program.parseAsync();
    } catch (e) {
        if (e instanceof ToolError) {
            console.log(e.message);
            process.exitCode = 1;
        } else if (!(e instanceof PagerClosedError)) {
            error = e;
        }
    }

    // Wait for the user to quit the pager, if any.
    await stopPager();

    if (error !== undefined) {
        throw error;
    }
}

main();
