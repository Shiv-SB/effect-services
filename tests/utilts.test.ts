import { Cron, Effect, Either, Exit, Schedule } from "effect";
import { Utils } from "../src/utils";
import { describe, expect, it, test } from "@effect/vitest";

describe("Arguments and returns", () => {
    const testCron = Cron.unsafeParse("0 * * * *");

    it.effect("Should accept correct arguments", () => Effect.gen(function* () {
        const input = {
            test: testCron,
        };

        const result = yield* Utils.ScheduleCronComposer(input);
        expect(result).to.have.key("test");
        expect(Schedule.isSchedule(result.test)).toBeTruthy();
    }));

    it.effect("Should fail fast on invalid arguments", () => Effect.gen(function* () {
        const testCases: any[] = [
            "",
            null,
            undefined,
            67,
            { "foo": Schedule.identity() },
            { "foo": testCron.toJSON() },
            { "foo": { } },
            { "foo": [testCron] },
            { "foo": [[testCron]] },
            { "foo": [[testCron, { }]] },
            { "foo": [[testCron, testCron, testCron]] },
        ];

        for (const testCase of testCases) {
            const result = yield* Effect.either(Utils.ScheduleCronComposer(testCase));
            expect(result._tag, testCase).toBe("Left");

            if (Either.isLeft(result)) {
                expect(result.left.reason).toBe("INVALID_FUNC_ARGS");
            } else {
                expect.unreachable();
            }
        }
    }));

    it.effect("Should produce correct return object", () => Effect.gen(function* () {
        const input = {
            test1: testCron,
            test2: testCron,
            test3: testCron,
        };

        const output = yield* Utils.ScheduleCronComposer(input);

        const inputKeys = Object.keys(input);
        const outputKeys = Object.keys(output);

        expect(inputKeys).to.have.members(outputKeys);
    }));
});


