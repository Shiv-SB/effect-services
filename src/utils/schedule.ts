import * as Effect from "effect/Effect";
import * as Cron from "effect/Cron";
import * as S from "effect/Schema";
import * as Either from "effect/Either";
import * as Data from "effect/Data";
import * as Schedule from "effect/Schedule";
import * as ParseResult from "effect/ParseResult";

// TODO: 
// Refactor to accept any number of Crons instead of tuple pair

type CronPair = [Cron.Cron, Cron.Cron];
// We use this type for the function arg instead of
// the Type constructed from the schema below because
// this one is slightly better for readability.
// They are functionaly the same types otherwise.
type ScheduleMapping<T extends string> = Record<T, Cron.Cron | CronPair[]>;

const CronSchema = S.declare(
  (input: unknown): input is Cron.Cron => Cron.isCron(input)
).annotations({
    message: (_issue) => `Expected type Cron.Cron`
});

const CronSchemas = S.Union(
    S.Array(S.Tuple(CronSchema, CronSchema)),
    CronSchema,
).annotations({
    identifier: "Cron or Cron Tuple"
});

const funcArgSchema = S.Record({
    key: S.String,
    value: CronSchemas
}).annotations({
    identifier: "ScheduleCronComposer Args",
});

class ScheduleCronComposerError extends Data.TaggedError("ScheduleCronComposerError")<{
    cause?: unknown;
    reason: "INVALID_FUNC_ARGS" | "UNREACHABLE";
}> { }

export const ScheduleCronComposer = <T extends string>(
    scheduleMapping: ScheduleMapping<T>,
) => Effect.gen(function* () {
    const args = Bun.argv.slice(2);

    const validate = S.decodeEither(funcArgSchema, { exact: true });
    const validateResult = validate(scheduleMapping);

    if (Either.isLeft(validateResult)) {
        return yield* new ScheduleCronComposerError({
            reason: "INVALID_FUNC_ARGS",
            cause: validateResult.left,
        });
    }

    const names = Object.keys(scheduleMapping) as T[];
    const allowedArgs: S.Literal<["now", ...T[]]> = S.Literal("now", ...names);
    type AllowedArgs = typeof allowedArgs.Type; // T | "now"

    /*
    This should return a Struct Schema like:
    S.Struct({
        now: S.optional(S.Boolean),
        string1: S.optional(S.Boolean),
        string2: ...
    });
    */
    const constructFlagSchema: () => S.Struct<Record<AllowedArgs, S.optional<typeof S.Boolean>>> = () => {
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
        constructFlagSchema() as S.Struct<Record<string, S.optional<typeof S.Boolean>>>, // target 
        {
            strict: true,
            decode(source) {
                let result = {} as Record<string, boolean>;
                for (const key of source) {
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
    const flags = (yield* transformToFlags(args).pipe(
        Effect.mapError((e) => new ScheduleCronComposerError({ cause: e, reason: "UNREACHABLE" }))
    )) as Record<AllowedArgs, boolean | undefined>;

    const defaultSchedules = {} as Record<T, Schedule.Schedule<unknown>>;

    for (const name of names) {
        const rawSchedule = scheduleMapping[name];
        if (Array.isArray(rawSchedule)) {
            let endSchedule: Schedule.Schedule<unknown>;
            endSchedule = Schedule.union(
                Schedule.cron(rawSchedule[0]![0]),
                Schedule.cron(rawSchedule[0]![1])
            );

            for (let i = 0; i < rawSchedule.length - 1; i++) {
                const cronPair = rawSchedule[i]!;
                const union = Schedule.union(
                    Schedule.cron(cronPair[0]),
                    Schedule.cron(cronPair[1]),
                );
                endSchedule = Schedule.union(endSchedule, union);
            }

            defaultSchedules[name] = endSchedule;
        } else {
            defaultSchedules[name] = Schedule.cron(rawSchedule);
        }
    }

    const isNow = flags.now === true;
    const selectedJobs = names.filter((name) => flags[name]);
    const anyJobFlag = selectedJobs.length > 0;
    const DontRun = Schedule.recurWhile(() => false);

    if (!anyJobFlag) {
        yield* Effect.log("Running with default Cron Schedules");
    }

    const schedules = Object.fromEntries(names.map((name) => {
        // Case 1: no flags → default
        if (!Object.values(flags).includes(true)) {
            return [name, defaultSchedules[name]];
        }

        // Case 2: now only → all jobs once
        if (isNow && !anyJobFlag) {
            return [name, Schedule.once];
        }

        // Case 3 & 4: job selection involved
        if (anyJobFlag) {
            if (selectedJobs.includes(name)) {
                return [
                    name,
                    isNow ? Schedule.once : defaultSchedules[name],
                ];
            } else {
                return [name, DontRun];
            }
        }
        // fallback (should never hit)
        return [name, DontRun];
    })) as Record<T, Schedule.Schedule<unknown, unknown, never>>;

    yield* Effect.log("Composer execution plan:");
    for (const name of names) {
        const schedule = schedules[name];
        let mode: string;

        if (schedule === DontRun) {
            mode = "DISABLED";
        } else if (schedule === Schedule.once) {
            mode = "RUN ONCE (immediate)";
        } else {
            const cron = scheduleMapping[name];
            if (!Array.isArray(cron)) {
                const next = Cron.next(cron).toLocaleString();
                mode = `Default Cron (Next run: ${next})`;
            } else {
                mode = `Default Cron (Combined ${cron.length * 2} schedules)`;
            }
        }
        yield* Effect.log(`${name}: ${mode}`);
    }
    return schedules;
}).pipe(
    Effect.withLogSpan("Schedule Composer"),
);
/*
Effect.gen(function* () {
    const schedules = yield* ScheduleCronComposer({
        users: [[Cron.unsafeParse("5 4 * * *"), Cron.unsafeParse("0 23 * * *")]],
        sessions: [
            [Cron.unsafeParse("5 4 * * *"), Cron.unsafeParse("0 * * * *")],
            [Cron.unsafeParse("15 12 5 * *"), Cron.unsafeParse("0 0 4,7 * 1")],
        ],
        offices: Cron.unsafeParse("0 0 * 4 *"),
    });
    const users = schedules.users;
}).pipe(
    Effect.provide(Logger.pretty),
    Effect.runPromise,
);
*/