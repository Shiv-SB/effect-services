import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type ApiClient from "@companieshouse/api-sdk-node/dist/client";
import { createApiClient } from "@companieshouse/api-sdk-node";

export class CompaniesHouseError extends Data.TaggedError("CompaniesHouseError")<{
    cause?: unknown;
    message: string;
}>{}

interface CompaniesHouseImpl {
    use: <T>(
        fn: (client: ApiClient) => T
    ) => Effect.Effect<Awaited<T>, CompaniesHouseError, never>
};

export class CompaniesHouse extends Context.Tag("effect-services/companieshouse/index/CompaniesHouse")<
    CompaniesHouse,
    CompaniesHouseImpl
>(){}

interface CompaniesHouseArgs {
    apiKey?: string;
    oauthToken?: string;
    baseUrl: string;
    baseAccountUrl: string;
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
