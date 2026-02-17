import { bytes, commify } from "ts-humanize";
import path from "node:path";
import fs from "node:fs/promises";

// # region Utils

function printC(
    col: string,
    data: string,
    lvl: "log" | "warn" | "error" = "log"
) {
    const c = Bun.color(col.toLowerCase(), "ansi") ?? "";
    const r = "\x1b[0m";
    console[lvl](`${c}${data}${r}`);
}

function normalize(p: string) {
    return p.split(path.sep).join("/");
}

function isNodeModule(p: string) {
    return normalize(p).includes("node_modules");
}

function getAllIndexFiles(): string[] {
    const glob = new Bun.Glob("**/index.ts");
    const src = "./src";
    const files: string[] = [];

    for (const file of glob.scanSync(src)) {
        files.push(path.join(src, file));
    }

    printC("cyan", "Detected entrypoints:");
    files.forEach((f) => console.log("  ", f));
    console.log();

    return files;
}

async function deleteBuildFolder() {
    await fs.rm("build", { recursive: true, force: true });
}

// #region Delete

printC("orange", "Deleting current build folder...");
await deleteBuildFolder();
printC("orange", "...Build folder deleted");

// #region Build

const start = performance.now();

const build = await Bun.build({
    entrypoints: getAllIndexFiles(),
    metafile: true,
    minify: true,
    outdir: "build",
    splitting: true,
    sourcemap: "none",
    format: "esm",
    target: "node",
});

const end = performance.now();

if (!build.success) {
    printC("red", "Build failed.", "error");
    process.exit(1);
}

printC("chartreuse", "Build success!\n");

if (build.logs.length) {
    printC("orange", "Build completed with warnings:");
    for (const log of build.logs) {
        console.warn(`  ${log}`);
    }
    console.log();
}

const meta = build.metafile!;
let totalIn = 0;
let totalOut = 0;

// #region Size Summary

for (const input of Object.entries(meta.inputs)) {
    totalIn += input[1].bytes;
}

for (const output of Object.values(meta.outputs)) {
    totalOut += output.bytes;
}

const reducedSize = (totalIn - totalOut) / totalIn;
const timeTaken = end - start;
const totalInCount = Object.entries(meta.inputs).length;

printC("chartreuse", `Build Size ${bytes(totalOut)}\n`);

console.table({
    "Total Bytes in": bytes(totalIn),
    "Total Bytes out": bytes(totalOut),
    "Total files in": commify(totalInCount),
    "Reduced by": (reducedSize * 100).toFixed(2) + " %",
    "Time taken": timeTaken.toFixed(2) + " ms",
});

// #region Output Tree

printC("cyan", "\nOutput Dependency Tree (src only):\n");

const outputs = meta.outputs;

const entryOutputs = Object.entries(outputs)
    .filter(([_, o]) => o.entryPoint)
    .map(([p]) => p);

function printOutputTree(
    file: string,
    indent = "",
    visited = new Set<string>()
) {
    if (visited.has(file)) return;
    visited.add(file);

    const output = outputs[file];
    if (!output) return;

    printC("chartreuse", `${indent}└── ${file} (${bytes(output.bytes)})`);

    // Imported chunks
    for (const imp of output.imports) {
        if (outputs[imp.path] && !isNodeModule(imp.path)) {
            printOutputTree(imp.path, indent + "    ", visited);
        }
    }

    // Source inputs (ignore node_modules)
    for (const input of Object.keys(output.inputs)) {
        if (!isNodeModule(input)) {
            printC("gray", `${indent}    ├── ${input}`);
        }
    }
}

for (const entry of entryOutputs) {
    printOutputTree(entry);
}

// #region Source Tree

printC("yellow", "\nSource Dependency Tree (src only):\n");

function printSourceTree(
    file: string,
    indent = "",
    visited = new Set<string>()
) {
    if (visited.has(file)) return;
    if (isNodeModule(file)) return;

    visited.add(file);

    const input = meta.inputs[file];
    if (!input) return;

    printC("yellow", `${indent}└── ${file}`);

    for (const imp of input.imports) {
        if (
            !imp.external &&
            meta.inputs[imp.path] &&
            !isNodeModule(imp.path)
        ) {
            printSourceTree(imp.path, indent + "    ", visited);
        }
    }
}

for (const entry of entryOutputs) {
    const entrySource = meta.outputs[entry]!.entryPoint!;
    if (!isNodeModule(entrySource)) {
        printSourceTree(entrySource);
    }
}

// #region Type declarations

printC("orange", "\nGenerating .d.ts files...");

const proc = Bun.spawnSync(
    ["bunx", "tsc", "--p", "tsconfig.build.json"],
    {
        stderr: "inherit",
        stdout: "inherit",
    }
);

if (proc.success) {
    printC("chartreuse", ".d.ts file(s) generated.");
} else {
    printC("red", "Failed to generate .d.ts file(s).", "error");
}