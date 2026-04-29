import * as S from "effect/Schema";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import { pipe } from "effect";

export class ValidatorError extends Data.TaggedError("ValidatorError")<{
    message: string;
    reason: "INVALID_FUNC_ARGS" | "INVALID_CLI_ARGS";
    cause?: unknown;
}> { }

const CLI_VERSION = "1.0.0";

type ValidatorOpts<A extends string, L extends string> = {
    shortFlag: `-${string}`,
    allowedArgs: A[],
    longFlags?: L[], // cannot validate long flags with schema; would overlap with other args
}

export const Validator = <A extends string, L extends string>(
    opts: ValidatorOpts<A, L>
): Effect.Effect<{
    args: A[];
    longFlags: L[];
}, ValidatorError, never> => Effect.gen(function* () {
    const {
        shortFlag,
        allowedArgs,
        longFlags = [],
    } = opts;

    const allowedArgsSchema = S.Array(S.Literals(allowedArgs))
        .pipe(S.mutable)
        .annotate({ identifier: "Allowed Arguments" });

    const isBun = process.versions["bun"] as string | undefined;
    const args = (isBun ? Bun : process).argv.slice(2);

    const defaultLongFlags = ["help", "version"] as const;
    type DLF = typeof defaultLongFlags[number];

    const collectedArgs: A[] = [];
    const collectedLongFlags: L[] = [];
    let collecting = false;

    for (const arg of args) {
        if (arg === shortFlag) {
            collecting = true;
            continue;
        }

        if (arg.startsWith("-")) {
            if (arg.startsWith("--")) {
                const flag = arg.slice(2) as L;
                if (collecting && (longFlags.includes(flag) || defaultLongFlags.includes(flag as DLF))) {
                    collectedLongFlags.push(flag);
                } else {
                    collecting = false;
                }
            } else {
                collecting = false;
            }
            continue;
        }

        if (!collecting) {
            continue;
        }

        collectedArgs.push(arg as A);
    }

    if (collectedLongFlags.includes("help" as L)) {
        const helpText =
            `
        allowed short flag: ${shortFlag}
        allowed argument(s) for short flag: ${allowedArgs
                .map((x) => `'${x}'`)
                .join(", ")
            }
        allowed long flag(s): ${longFlags
                .map((x) => `'${x}'`)
                .join(", ")
            }

        Example usages:
            $ bun file.ts ${shortFlag} ${allowedArgs[0]}
            $ bun file.ts ${shortFlag} ${allowedArgs[1] ?? allowedArgs[0]} --${longFlags[0]}
            $ bun file.ts --help
        `;
        yield* Effect.log(helpText);
        process.exit(0);
    }

    if (collectedLongFlags.includes("version" as L)) {
        yield* Effect.log(CLI_VERSION);
        process.exit(0);
    }

    const result = S.decodeUnknownResult(allowedArgsSchema)(collectedArgs);


    if (result._tag === "Failure") {
        return yield* new ValidatorError({
            message: result.failure.toString(),
            reason: "INVALID_CLI_ARGS",
        });
    }

    return { args: result.success, longFlags: collectedLongFlags };
});

const Test = Effect.gen(function* () {
    const result = yield* Validator({
        shortFlag: "-c",
        allowedArgs: ["users", "sessions"],
        longFlags: ["now"],
    });

    yield* Effect.log(result);
});

pipe(
    Test,
    Effect.runPromise,
)