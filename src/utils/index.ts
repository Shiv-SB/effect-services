import * as Effect from "effect/Effect";
import * as Cron from "effect/Cron";
import * as S from "effect/Schema";
import { Logger, ParseResult } from "effect";

type ScheduleMapping<T extends string> = Record<T, Cron.Cron | Cron.Cron[]>;
type ComposerOpts = {
    disableLogging?: boolean;
};

export const ScheduleComposer = <T extends string>(
    scheduleMapping: ScheduleMapping<T>,
    opts?: ComposerOpts,
) => Effect.gen(function* () {
    const args = Bun.argv.slice(2);
    const names = Object.keys(scheduleMapping) as T[]; // should be a collection of T's ?

    const allowedArgs: S.Literal<["now", ...T[]]> = S.Literal("now", ...names);
    type AllowedArgs = typeof allowedArgs.Type;
    
    const constructFlagSchema: () => S.Struct<Record<T | "now", S.optional<typeof S.Boolean>>> = () => {
        const vals = allowedArgs.literals;
        const resultObj = {} as Record<AllowedArgs, S.optional<typeof S.Boolean>>;

        vals.forEach((val) => {
            resultObj[val] = S.optional(S.Boolean);
        });

        return S.Struct(resultObj);
    };

    const argArrSchema = S.Array(allowedArgs);

    const ArgsToFlags = S.transformOrFail(
        argArrSchema, // source
        constructFlagSchema(), // target
        {
            strict: true,
            decode(source) {
                let result = {} as Record<AllowedArgs, boolean>;
                for (const key of source) {
                    console.log(key);
                    result[key] = source.includes(key);
                }
                return ParseResult.succeed(result);
            },
            encode: (target, _, ast) => ParseResult.fail(new ParseResult.Forbidden(
                ast, target, "TODO"
            ))
        }
    ); 

    const transformToFlags = S.decodeUnknown(ArgsToFlags);
    const flags = yield* transformToFlags(args);
    yield* Effect.log(flags);

});

const Test = Effect.gen(function* () {
    const schedules = yield* ScheduleComposer({
        users: [Cron.unsafeParse("5 4 * * *"), Cron.unsafeParse("0 23 * * *")],
        sessions: Cron.unsafeParse("0 18 * * *"),
        offices: Cron.unsafeParse("0 0 * 4 *"),
    });
}).pipe(
    Effect.provide(Logger.pretty),
    Effect.runPromise,
);