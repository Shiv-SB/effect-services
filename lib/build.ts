import { bytes } from "ts-humanize";

const start = performance.now();

const build = await Bun.build({
    entrypoints: ["index.ts"],
    metafile: true,
    minify: true,
    outdir: "build",
});

const end = performance.now();

if (build.success) {
    console.log("Build success");

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

    for (let i = 0; i < inLen + outLen - 1; i++) {
        if (i < outLen) {
            const filePath = outKeys[i]!;
            const file = meta.outputs[filePath]!;
            totalOut += file.bytes;
        } else {
            const filePath = inKeys[i]!;
            const file = meta.inputs[filePath]!;
            totalIn += file.bytes;

        }
    }

    const reducedSize = (totalIn - totalOut) / totalIn;
    const timeTaken = end - start;

    console.table({
        "Total Bytes in": bytes(totalIn),
        "Total Bytes out": bytes(totalOut),
        "Reduced by:": (reducedSize * 100).toFixed(2) + " %",
        "Time taken:": timeTaken.toFixed(2) + " ms"
    })
}