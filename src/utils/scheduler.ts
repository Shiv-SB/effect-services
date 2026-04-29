import { Effect, Schema as S, Cron, Schedule, Data, Result } from "effect";
import { Validator } from "../internals/cli";

const CronSchema = S.declare(
    (input: unknown): input is Cron.Cron => Cron.isCron(input)
).annotate({
    message: "Expected type Cron.Cron"
});

const CronSchemas = S.Union([
    S.mutable(S.Array(CronSchema)),
    CronSchema,
]).annotate({
    identifier: "Cron or Cron Tuple"
});

const funcArgSchema = S.Record(S.String, CronSchemas).annotate({
    identifier: "ScheduleCronComposer Args",
});

type ScheduleMapping<T extends string> = Record<T, typeof CronSchemas.Type>;
type ScheduleMappingProp = typeof CronSchemas.Type;

export class ScheduleCronComposerError extends Data.TaggedError("ScheduleCronComposerError")<{
    cause?: unknown;
    reason: "INVALID_FUNC_ARGS" | "UNREACHABLE" | "INVALID_CLI_ARGS";
}> { }

type ScheduleCronComposerReturnType<T extends string> = Effect.Effect<
    Record<T, Schedule.Schedule<unknown>>, ScheduleCronComposerError, never
>

/**
 * A CLI utility used to compose Cron schedules per job name. 
 * 
 * Intended usage: You have a number of jobs which run on Cron Schedules.
 * In development/testing environments you need to run specific jobs immediately.
 * 
 * A single Cron, or an array of Crons can be passed to a job.
 * If multiple Cron schedules are passed to a job, they will be merged into a single schedule.
 * 
 * @example
 * // index.ts
 * const Main = Effect.gen(function* () {
 *  const schedules = yield* ScheduleCronComposer({
 *      job1: Cron.parseUnsafe("0 5 * * *"),
 *      job2: [Cron.parseUnsafe("30 4 * * 4"), Cron.parseUnsafe("0 23 * * 1-3")],
 *      job3: Cron.parseUnsafe("* 12 * * *"),
 *  });
 * 
 *  const job1 = Effect.succeed("foo!").pipe(Effect.schedule(schedules.job1));
 *  const job2 = Effect.succeed("bar!").pipe(Effect.schedule(schedules.job2));
 * 
 *  // Common pitfall - Set concurrency to unbounded, otherwise only the first job will ever run!
 *  yield* Effect.all([job1, job2], { concurrency: "unbounded" });
 * }).pipe(Effect.runPromise);
 * 
 * // CLI usage:
 * 
 * // To run all jobs with their default provided schedules:
 * $ bun index
 * 
 * // To run only job1 on its provided schedule:
 * $ bun index -c job1
 * 
 * // To run only job1 and job2, but immediately and only once:
 * $ bun index -c job1 job2 --now
 * 
 * // To run all jobs immediately and only once:
 * $ bun index -c --now
 */
export const ScheduleCronComposer = <T extends string>(
    scheduleMapping: ScheduleMapping<T>,
    flag: `-${string}` = "-c",
): ScheduleCronComposerReturnType<T> => Effect.gen(function* () {
    // #region Validation
    const validate = S.decodeResult(funcArgSchema);
    const validateResult = validate(scheduleMapping);

    if (Result.isFailure(validateResult)) {
        return yield* new ScheduleCronComposerError({
            reason: "INVALID_FUNC_ARGS",
            cause: validateResult.failure,
        });
    }

    const names = Object.keys(scheduleMapping) as T[];

    const validationResult: {
        args: T[];
        longFlags: "now"[];
    } = yield* Validator({
        shortFlag: flag,
        allowedArgs: names,
        longFlags: ["now"],
    }).pipe(
        Effect.mapError((e) => new ScheduleCronComposerError({
            cause: e,
            reason: "INVALID_CLI_ARGS",
        }))
    );

    // #region Merge Schedules

    const defaultSchedules = {} as Record<T, Schedule.Schedule<unknown, unknown, unknown, unknown>>;
    const nextMappings: Map<T, Date[]> = new Map();

    for (const name of names) {
        const rawSchedule: ScheduleMappingProp = scheduleMapping[name];
        const nextArr: Date[] = [];
        if (Array.isArray(rawSchedule)) {
            const len = rawSchedule.length;
            let merged: Schedule.Schedule<unknown, unknown, unknown> = Schedule.cron(rawSchedule[0]!);
            for (let i = 0; i < len; i++) {
                const curr = rawSchedule[i]!;
                const next = Cron.next(curr);
                nextArr.push(next);
                if (len === 1) {
                    defaultSchedules[name] = Schedule.cron(rawSchedule[0]!);
                    break;
                }
                merged = Schedule.both(merged, Schedule.cron(curr));
            }
            defaultSchedules[name] = merged;
            nextMappings.set(name, nextArr);
        } else {
            defaultSchedules[name] = Schedule.cron(rawSchedule);
            nextMappings.set(name, [Cron.next(rawSchedule)]);
        }
    }

    // #region Set Flags

    const isNow = validationResult.longFlags.includes("now");
    const selectedJobs = validationResult.args;
    const anyJobFlag = selectedJobs.length > 0;
    const DontRun = Schedule.recurs(-1);
    const runOnce = Schedule.recurs(1);

    if (!anyJobFlag) {
        yield* Effect.log("Running with default Cron Schedules");
    }

    const schedules = Object.fromEntries(names.map((name) => {
        // Case 1: no flags → default
        if (!selectedJobs.length && !isNow) {
            return [name, defaultSchedules[name]];
        }

        // Case 2: now only → all jobs once
        if (isNow && !anyJobFlag) {
            return [name, runOnce];
        }

        // Case 3 & 4: job selection involved
        if (anyJobFlag) {
            if (selectedJobs.includes(name)) {
                return [
                    name,
                    isNow ? runOnce : defaultSchedules[name],
                ];
            } else {
                return [name, DontRun];
            }
        }
        // fallback (should never hit)
        return [name, DontRun];
    })) as Record<T, Schedule.Schedule<unknown, unknown, never>>;

    // #region Log

    yield* Effect.log("Composer execution plan:");
    for (const name of names) {
        const schedule = schedules[name];
        let mode: string;

        if (schedule === DontRun) {
            mode = "DISABLED";
        } else if (schedule === runOnce) {
            mode = "RUN ONCE (immediate)";
        } else {
            const cron = nextMappings.get(name)!;
            const sorted = cron.toSorted((a, b) => a.getTime() - b.getTime());
            const firstRun = sorted[0]!.toLocaleString();
            // length check because if arr len == 1 then its a overly verbose for no benifit.
            if (Array.isArray(scheduleMapping[name]) && scheduleMapping[name].length > 1) {
                mode = `Default Cron (Combined ${cron.length} schedules). Next run: ${firstRun}`;
            } else {
                mode = `Default Cron (Next run: ${firstRun})`;
            }
        }
        yield* Effect.log(`${name}: ${mode}`);
    }
    return schedules;
}).pipe(
    Effect.withLogSpan("Schedule Composer"),
);

Effect.gen(function* () {
    const schedules = yield* ScheduleCronComposer({
        users: [Cron.parseUnsafe("5 4 * * *"), Cron.parseUnsafe("0 23 * * *")],
        sessions: [
            Cron.parseUnsafe("5 4 * * *"),
            Cron.parseUnsafe("0 * * * *"),
            Cron.parseUnsafe("15 12 5 * *"),
        ],
        offices: Cron.parseUnsafe("0 0 * 4 *"),
        incidents: [Cron.parseUnsafe("0 19 * * 6")],
    });
    yield* Effect.log("Users", schedules.users);
}).pipe(
    Effect.runPromise,
);
