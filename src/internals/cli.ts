import { Data, Effect, Logger, Option, pipe } from "effect";
import * as S from "effect/Schema";

class ValidatorError extends Data.TaggedError("ValidatorError")<{
    message: string;
    reason: "INVALID_FUNC_ARGS" | "INVALID_CLI_ARGS";
    cause?: unknown;
}>{}

const Validator = <T extends string, L extends string>(
    shortFlag: `-${string}`,
    allowedArgs: T[],
    longFlags: L[], // cannot validate long flags with schema; would overlap with other args
) => Effect.gen(function* () {
    const allowedArgsSchema = S.Array(S.Literal(...allowedArgs)).annotations({
        title: "Allowed Arguments",
    });

    const args = Bun.argv.slice(2);

    const outputs: T[] = [];
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
                if (collecting && (longFlags.includes(flag) || flag === "help")) {
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

        outputs.push(arg as T);
    }

    console.log(collectedLongFlags);

    if (collectedLongFlags.includes("help" as L)) {
        const helpText = 
        `
        allowed short flag: ${shortFlag}
        allowed argument(s) for short flag: ${
            allowedArgs
                .map((x) => `'${x}'`)
                .join(", ")
        }
        allowed long flag(s): ${
            longFlags
                .map((x) => `'${x}'`)
                .join(", ")
        }

        Example usages:
            $ bun file.ts ${shortFlag} ${allowedArgs[0]}
            $ bun file.ts ${shortFlag} ${allowedArgs[1] ?? allowedArgs[0]} --${longFlags[0]}
            $ bun file.ts --help
        `;
        yield* Effect.log(helpText);
        return Option.none();
    }

    yield* S.decodeUnknown(allowedArgsSchema)(outputs);

    return Option.some({ args: outputs, longFlags: collectedLongFlags });
});

const Test = Effect.gen(function* () {
    const result = yield* Validator("-c", [
        "users",
        "sessions",
    ], [
        "now"
    ]);

    yield* Effect.log(result);
});

pipe(
    Test,
    Effect.provide(Logger.pretty),
    Effect.runPromise,
)