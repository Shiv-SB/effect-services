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

export class CompaniesHouseError extends Data.TaggedError("CompaniesHouseError")<{
    cause?: unknown;
    message: string;
}> { }

interface CompaniesHouseImpl {
    use: <T>(
        fn: (client: ApiClient) => T
    ) => Effect.Effect<Awaited<T>, CompaniesHouseError, never>
};

export class CompaniesHouse extends Context.Tag("effect-services/companieshouse/index/CompaniesHouse")<
    CompaniesHouse,
    CompaniesHouseImpl
>() { }

interface CompaniesHouseArgs {
    apiKey?: string;
    oauthToken?: string;
    baseUrl?: string;
    baseAccountUrl?: string;
}

export const make = (
    options: CompaniesHouseArgs
) => Effect.gen(function* () {
    const client = createApiClient(
        options.apiKey,
        options.oauthToken,
        options.baseUrl,
        options.baseAccountUrl
    );

    return CompaniesHouse.of({
        use: (fn) => Effect.gen(function* () {
            const result = yield* Effect.try({
                try: () => fn(client),
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
    })
});

export const layer = (
    options: CompaniesHouseArgs
) => Layer.scoped(CompaniesHouse, make(options));

/*
    "x-ratelimit-limit": "600",
    "x-ratelimit-remain": "387",
    "x-ratelimit-reset": "1772723332", seconds unix time till reset
    "x-ratelimit-window": "5m",
*/
export const RetryPolicy = Schedule.identity<HttpClientError>().pipe(
    Schedule.addDelayEffect((err) => Effect.gen(function* () {
        if (err._tag === "ResponseError" && err.response.status === 429) {
            const resetHeader = err.response.headers["x-ratelimit-reset"]!;
            const timestamp = DateTime.unsafeMake(parseInt(resetHeader, 10) * 1000);
            const now = yield* DateTime.now;
            const diffMs = DateTime.distance(now, timestamp);
            yield* Effect.logWarning(`Rate limited. Waiting until ${DateTime.formatIso(timestamp)} (${Duration.format(diffMs)})`);
            return Duration.millis(diffMs);
        }
        return Duration.zero;
    }))
);

export class CompaniesHouseClient extends Effect.Service<CompaniesHouseClient>()("effect-services/companieshouse/index/CompaniesHouseClient", {
    effect: Effect.gen(function* () {
        const createApiClient = (
            apiKey: string
        ) => Effect.gen(function* () {
            const layer = FetchHttpClient.layer.pipe(
                Layer.provide(
                    Layer.succeed(FetchHttpClient.RequestInit, {
                        headers: {
                            Authorization: apiKey,
                        },
                    })
                )
            );

            const client = yield* HttpClient.HttpClient.pipe(
                Effect.provide(layer)
            );
            
            const get = (
                url: URL
            ) => Effect.gen(function* () {
                const response = yield* client.get(url).pipe(
                    Effect.flatMap(HttpClientResponse.filterStatus((res) => res !== 429)),
                    Effect.retry(RetryPolicy)
                );

                return response;
            });

            return {
                get,
                client,
            };

        });

        return {
            createApiClient
        }
    })
}) { }
