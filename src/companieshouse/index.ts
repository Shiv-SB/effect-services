import type ApiClient from "@companieshouse/api-sdk-node/dist/client";
import { createApiClient } from "@companieshouse/api-sdk-node";
import { Data, Effect, Context, Layer, flow, Schedule, Duration, DateTime } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http";
import type { HttpClientError } from "effect/unstable/http/HttpClientError";

export class CompaniesHouseError extends Data.TaggedError("CompaniesHouseError")<{
    cause?: unknown;
    message: string;
}> { }

//#region SDK Client

interface CompaniesHouseImpl {
    use: <T>(
        fn: (client: ApiClient) => T
    ) => Effect.Effect<Awaited<T>, CompaniesHouseError, never>
};

export interface ConfigOpts {
    apiKey: string;
}

class Config extends Context.Service<Config, ConfigOpts>()("effect-services/companieshouse/index/Config") { }

const ConfigLayer = (opts: ConfigOpts) => Layer.succeed(Config, opts);

/**
 * An Effectful, lightweight wrapper for the Companies House SDK.
 * Uses @companieshouse/api-sdk-node version: COMPANIES_HOUSE_VERSION
 */
export class CompaniesHouse extends Context.Service<CompaniesHouse>()("CompaniesHouse", {
    make: Effect.gen(function* () {
        const config = yield* Config;
        const client = createApiClient(config.apiKey);

        return {
            use: (fn) => Effect.gen(function* () {
                const result = yield* Effect.try({
                    try: () => fn(client),
                    catch: (e) => new CompaniesHouseError({
                        cause: e,
                        message: "Syncronous error in CompaniesHouse.use"
                    })
                });

                if (result instanceof Promise) {
                    return yield* Effect.tryPromise({
                        try: () => result,
                        catch: (e) => new CompaniesHouseError({
                            cause: e,
                            message: "Asyncronous error in CompaniseHouse.use",
                        })
                    });
                } else {
                    return result;
                }
            })
        } satisfies CompaniesHouseImpl;
    })
}) {
    static readonly layer = (args: ConfigOpts) => Layer.effect(this, this.make).pipe(
        Layer.provide(ConfigLayer(args))
    )
}

export interface ClientConfigOpts extends ConfigOpts {
    /**
     * If ommited, the base URL will default to
     * `https://api.company-information.service.gov.uk`.
     */
    baseURL?: string;
}

//#region Custom Client

class ClientConfig extends Context.Service<ClientConfig, ClientConfigOpts>()("effect-services/companieshouse/index/ClientConfig") { }

const ClientConfigLayer = (opts: ClientConfigOpts) => Layer.succeed(ClientConfig, opts);

/**
 * Make an authenticated Companies House API Client.
 * 
 * Automatically handles 429 retries.
 * Will throw on any other 4xx or 5xx status
 */
export class CompaniesHouseClient extends Context.Service<CompaniesHouseClient>()("effect-services/companieshouse/index/CompaniesHouseClient", {
    // TODO: rewrite with proper impl like above
    make: Effect.gen(function* () {
        const config = yield* ClientConfig;
        /*
            "x-ratelimit-limit": "600",
            "x-ratelimit-remain": "387",
            "x-ratelimit-reset": "1772723332", seconds unix time till reset
            "x-ratelimit-window": "5m",
        */
        const handleRetry = Effect.fnUntraced(function* (err: HttpClientError) {
            if (err.response?.status === 429) {
                const resetHeader = err.response.headers["x-ratelimit-reset"]!;
                const timestamp = DateTime.makeUnsafe(parseInt(resetHeader, 10) * 1000);
                const now = yield* DateTime.now;
                const diffMs = DateTime.distance(now, timestamp);
                yield* Effect.logWarning(`Rate limited. Waiting until ${DateTime.formatIso(timestamp)} (${Duration.format(diffMs)})`);
                return diffMs;
            }
            return Duration.zero;
        });


        const RetryPolicy = Schedule.identity<HttpClientError>().pipe(
            Schedule.addDelay((err) => handleRetry(err))
        );

        const baseURL = config.baseURL ?? "https://api.company-information.service.gov.uk";

        const client: HttpClient.HttpClient.With<HttpClientError> = (yield* HttpClient.HttpClient).pipe(
            HttpClient.mapRequest(flow(
                HttpClientRequest.prependUrl(baseURL),
                HttpClientRequest.setHeader("Authorization", config.apiKey),
                HttpClientRequest.acceptJson,
            )),
            HttpClient.filterStatusOk,
            HttpClient.retryTransient({
                retryOn: "errors-only",
                schedule: RetryPolicy,
            }),
        );


        return client;
    })
}) { 
    static readonly layer = (opts: ClientConfigOpts) => Layer.effect(this, this.make).pipe(
        Layer.provideMerge(ClientConfigLayer(opts)),
        Layer.provideMerge(FetchHttpClient.layer),
    )
}