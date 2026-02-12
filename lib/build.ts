import { bytes } from "ts-humanize";

function printC(col: string, data: string, lvl: "log" | "warn" | "error" = "log") {
    const c = Bun.color(col.toLowerCase(), "ansi") ?? "";
    const r = "\x1b[0m"
    console[lvl](`${c}${data}${r}`);
}
const start = performance.now();

const build = await Bun.build({
    entrypoints: ["index.ts"],
    metafile: true,
    minify: true,
    outdir: "build",
    splitting: true,
});

const end = performance.now();

if (build.success) {
    printC("Chartreuse", "Build success!\n");

    if (build.logs.length) {
        console.warn("Build completed with warnings:");
        for (const log of build.logs) {
            console.warn(`    ${log}`);
        }
    }

    let totalOut = 0;
    let totalIn = 0;

    const meta = build.metafile!;

    const inKeys = Object.keys(meta.inputs!);
    const outKeys = Object.keys(meta.outputs!);

    const inLen = inKeys.length;
    const outLen = outKeys.length;

    const outArr: string[] = [];

    for (let i = 0; i < inLen; i++) {
        if (i < outLen) {
            const filePath = outKeys[i]!;
            const file = meta.outputs[filePath]!;
            totalOut += file.bytes;
            const out = `   └── ${filePath} (${bytes(file.bytes)})`;
            outArr.push(out);
        } else {
            const filePath = inKeys[i]!;
            //console.log(filePath);
            const file = meta.inputs[filePath]!;
            totalIn += file.bytes;
        }
    }

    const reducedSize = (totalIn - totalOut) / totalIn;
    const timeTaken = end - start;

    printC("Chartreuse", `Build Size ${bytes(totalOut)}`);
    for (const str of outArr) {
        printC("Chartreuse", str);
    }
    console.log();

    console.table({
        "Total Bytes in": bytes(totalIn),
        "Total Bytes out": bytes(totalOut),
        "Reduced by:": (reducedSize * 100).toFixed(2) + " %",
        "Time taken:": timeTaken.toFixed(2) + " ms"
    });

    printC("orange", "Generating .d.ts files...");

    const proc = Bun.spawnSync(["bunx", "tsc", "--p", "tsconfig.build.json"], {
        stderr: "inherit",
        stdout: "inherit",
    });

    if (proc.success) {
        printC("Chartreuse", ".d.ts file(s) generated.");
    } else {
        console.error("Failed to generate .d.ts file(s) :(");
    }
}