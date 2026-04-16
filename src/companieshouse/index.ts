import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Duration from "effect/Duration";
import * as DateTime from "effect/DateTime";
import * as Schedule from "effect/Schedule";
import type ApiClient from "@companieshouse/api-sdk-node/dist/client";
import { createApiClient } from "@companieshouse/api-sdk-node";
import { FetchHttpClient, HttpClient, HttpClientResponse } from '@effect/platform';
import type { HttpClientError } from "@effect/platform/HttpClientError";
import { Logger } from "effect";

export class CompaniesHouseError extends Data.TaggedError("CompaniesHouseError")<{
    cause?: unknown;
    message: string;
}> { }

interface CompaniesHouseImpl {
    use: <T>(
        fn: (client: ApiClient) => T
    ) => Effect.Effect<Awaited<T>, CompaniesHouseError, never>
};

interface ConfigOpts {
    apiKey: string;
}

class Config extends Context.Service<Config, ConfigOpts>()("Config") { }

const ConfigLayer = (opts: ConfigOpts) => Layer.succeed(Config, opts);

class CompaniesHouse extends Context.Service<CompaniesHouse>()("CompaniesHouse", {
    make: Effect.gen(function* () {
        const c = yield* Config;
        const _client = createApiClient(c.apiKey);

        const caller: CompaniesHouseImpl = {
            use: (fn) => Effect.gen(function* () {
                const result = yield* Effect.try({
                    try: () => fn(_client),
                    catch: (e) => new CompaniesHouseError({
                        cause: e,
                        message: "Syncronous error in 'CompaniesHouse.use'"
                    })
                });

                if (result instanceof Promise) {
                    return yield* Effect.tryPromise({
                        try: () => result,
                        catch: (e) => new CompaniesHouseError({
                            cause: e,
                            message: "Asyncronous error in 'CompaniesHouse.use'"
                        })
                    });
                } else {
                    return result;
                }
            })
        }

        return caller;
    }),
}) {
    static readonly layer = (opts: ConfigOpts) => Layer.effect(this, this.make).pipe(
        Layer.provide(ConfigLayer(opts))
    )
}

/*const Test = Effect.gen(function* () {
    const ch = yield* CompaniesHouse;
    const foo = yield* CompaniesHouse.use((c) => c.use((c) => c.companyProfile.getCompanyProfile("OC382982")));
    const get = ch.use((c) => c.companyProfile.getCompanyProfile("OC382982"));
    const profile = yield* get;
    console.log(profile, foo);
}).pipe(
    Effect.provide(CompaniesHouse.layer({ apiKey: "REDACTED" })),
    Effect.provide(Logger.layer([Logger.consolePretty()])),
);

Test.pipe(Effect.runPromise);*/

