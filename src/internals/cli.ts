import * as S from "effect/Schema";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";

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

    const allowedArgsSchema = S.Array(S.Literal(...allowedArgs))
        .pipe(S.mutable)
        .annotations({ identifier: "Allowed Arguments" });

    const args = Bun.argv.slice(2);

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

    const result = S.decodeUnknownEither(allowedArgsSchema)(collectedArgs);


    if (result._tag === "Left") {
        return yield* new ValidatorError({
            message: result.left.message,
            reason: "INVALID_CLI_ARGS",
        });
    }

    return { args: result.right, longFlags: collectedLongFlags };
});

/*const Test = Effect.gen(function* () {
    const result = yield* Validator({
        shortFlag: "-c",
        allowedArgs: ["users", "sessions"],
        longFlags: ["now"],
    });

    yield* Effect.log(result);
});

pipe(
    Test,
    Effect.provide(Logger.pretty),
    Effect.runPromise,
)*/