import { bytes, commify } from "ts-humanize";
import path from "node:path";
import fs from "node:fs/promises";
import * as fsSync from "node:fs";
import pkg from "../package.json";
import { Schema } from "effect";

// #region Utils

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

function hasUppercase(str: string): boolean {
    return str !== str.toLowerCase();
}

function getAllIndexFiles(): string[] {
    const glob = new Bun.Glob("src/*/index.ts");
    const files: string[] = [];

    for (const file of glob.scanSync(".")) {
        console.log(" >", file);
        files.push(file);
    }

    printC("cyan", "Detected entrypoints:");
    files.forEach((f) => console.log("  ", f));
    console.log();

    return files;
}

const allIndexFiles: string[] = getAllIndexFiles();

async function deleteBuildFolder() {
    await fs.rm("build", { recursive: true, force: true });
}

function getArgs() {
    const allowedArgs = [
        "cicd",
    ] as const;
    type Allowed = typeof allowedArgs[number];
    const ArgsSchema = Schema.Array(Schema.Literal(...allowedArgs));
    const args = Bun.argv.slice(2);
    const validated = Schema.decodeUnknownSync(ArgsSchema)(args);

    const result = Object.fromEntries(validated.map((val) => {
        return [val, true];
    })) as Record<Allowed, true>;

    return result;
}

const args = getArgs();

// #region Package.json

function getPkgExports(): string[] {
    const pkgExports = pkg.exports;
    const keys = Object.keys(pkgExports);
    const folderNames: string[] = [];

    for (const key of keys) {
        const folderName = key.substring(2).toLowerCase();
        folderNames.push(folderName);
    }

    return folderNames;
}

console.log("Entrypoints:");
for (const f of allIndexFiles) {
    console.log(" -", f);
}

function checkPkgFile() {
    const exports = new Set(getPkgExports());
    printC("cyan", "Detected exports in package.json:");
    exports.forEach((f) => console.log("  ", f));

    const entrypoints = new Set(allIndexFiles.map(
        (f) => path.basename(path.dirname(f))
    ));

    const entryLen = entrypoints.size;
    const expLen = exports.size;

    if (entryLen !== expLen) {
        console.error("Number of detected entrypoints does not match number of detected outputs");

        if (expLen < entryLen) {
            console.error("Package.json is missing exports for:");
            const invalidExports = exports.difference(entrypoints);
            const diff = entrypoints.difference(exports);

            diff.forEach((f) => console.error(` > ${f}`));

            if (invalidExports.size) {
                console.error("Detected invalid exports in package.json:")
                invalidExports.forEach((f) => console.error(` > ${f}`));
            }
        } else {
            console.error(`Expected ${entryLen} exports. Recieved: ${expLen}`);
        }

        console.error("Exiting build script...")
        process.exit(1);
    }

    const rawExports = pkg.exports;
    for (const key of Object.keys(rawExports)) {
        const exportPath = rawExports[key as keyof typeof rawExports];
        const imp = exportPath.import;
        const typ = exportPath.types;

        if (hasUppercase(imp) || hasUppercase(typ)) {
            console.error(`Detected uppercase characters in package json export:`, exportPath);
            process.exit(1);
        }
    }
}

checkPkgFile();

// #region Delete

printC("orange", "Deleting current build folder...");
await deleteBuildFolder();
printC("orange", "...Build folder deleted");

// #region Build

const start = performance.now();

const build = await Bun.build({
    root: "./src",
    entrypoints: allIndexFiles,
    metafile: true,
    minify: false,
    outdir: "build",
    splitting: true,
    sourcemap: "inline",
    format: "esm",
    target: "bun",
});

const end = performance.now();

if (!build.success) {
    printC("red", "Build failed.", "error");
    process.exit(1);
}

printC("chartreuse", "Build success!\n");

if (!args.cicd) {
    console.log("Saving metafile to disk...");
    await Bun.write("./meta/metafile.json", JSON.stringify(build.metafile, null, 2));
    console.log("Metafile saved!");
}

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

if (!args.cicd) printC("cyan", "\nOutput Dependency Tree (src only):\n");

const outputs = meta.outputs;


/**
 * Index files including parent folder
 * E.g. `["mssql/index.js", "legl/index.js"]`
 * 
 * Generated from metafile exports.
 *
 */
const entryOutputs = Object.entries(outputs)
    .filter(([p, o]) => o.entryPoint && p.endsWith("/index.js"))
    //.filter(([_, o]) => o.entryPoint)
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

if (!args.cicd) {
    for (const entry of entryOutputs) {
        printOutputTree(entry);
    }
}

// #region Source Tree

if (!args.cicd) printC("yellow", "\nSource Dependency Tree (src only):\n");

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

if (!args.cicd) {
    for (const entry of entryOutputs) {
        const entrySource = meta.outputs[entry]!.entryPoint!;
        if (!isNodeModule(entrySource)) {
            printSourceTree(entrySource);
        }
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


// #region Validate Structure

function validate() {
    const dir = "./build";
    const indexGlob = new Bun.Glob("**/index.js");
    const indexFiles: string[] = [];

    for (const file of indexGlob.scanSync(dir)) {
        indexFiles.push(file);
    }

    const isEqual = Bun.deepEquals(entryOutputs.toSorted(), indexFiles.toSorted());

    const entryLen = entryOutputs.length;
    const indexLen = indexFiles.length;

    const e = new Set(entryOutputs);
    const i = new Set(indexFiles);

    if (entryLen !== indexLen) {
        console.error(`Mismatch in build metafile (${entryLen}) and build actual (${indexLen})`);

        const diff = e.difference(i);
        console.error(
            "Metafile emmited the following output file(s) which probably shouldnt be here." +
            "\nCheck for circular dependencies, and ensure that chunks are being filtered out in the build step."
        );
        diff.forEach((f) => console.error("  >", f));
        // Dont exit here. If this case is true then the next case will be too.
    }

    if (!isEqual) {
        console.error(
            "The metafile exports do not match the actial build files." +
            "\nCheck the above errors for clues.\n"
        );
        console.log("metafile outputs:", e);
        console.log("build index files:", i);

        process.exit(1);

    }

    if (fsSync.existsSync("./build/src")) {
        console.error(`Detected "src" folder in build. Are circular dependencies not being properly handled?`);
        process.exit(1);
    }

    entryOutputs.forEach((filePath) => {
        const lc = filePath.toLowerCase();
        if (filePath !== lc) {
            console.error("All file paths should be lowercase! Detected uppercase chars:", filePath);
            process.exit(1);
        }
    });

    printC("green", "Build dir has correct structure.");
}

function validateExportsExist() {
    const rawExports = pkg.exports;

    for (const key of Object.keys(rawExports)) {
        const exp = rawExports[key as keyof typeof rawExports];
        const importPath = exp.import;
        const typesPath = exp.types;

        if (!fsSync.existsSync(importPath)) {
            console.error(`Missing export target (import): ${key} -> ${importPath}`);
            process.exit(1);
        }

        if (!fsSync.existsSync(typesPath)) {
            console.error(`Missing export target (types): ${key} -> ${typesPath}`);
            process.exit(1);
        }
    }

    printC("green", "All exports map to valid files.");
}

validate();
validateExportsExist();