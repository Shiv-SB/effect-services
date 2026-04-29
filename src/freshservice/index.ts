import { Context, Duration, Effect, flow, Layer, Option, Redacted, Schedule, Schema, Stream } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http";
import type { HttpClientError } from "effect/unstable/http/HttpClientError";
import { removeOrigin, unravel, type SearchParamInput } from "../internals/helpers";

function extractLinkValue(linkHeaderValue: string): Option.Option<URL> {
    const match = linkHeaderValue.match(/<([^>]+)>/);
    if (match && match[1]) {
        return Option.some(new URL(match[1]));
    } else {
        return Option.none();
    }
}

interface FreshServiceConfigOpts {
    baseURL: string;
    token: string | Redacted.Redacted<string>;
}

class FreshServiceConfig extends Context.Service<FreshServiceConfig, FreshServiceConfigOpts>()("effect-services/freshservice/index/FreshServiceConfig") { }

const FreshServiceConfigLayer = (opts: FreshServiceConfigOpts) => Layer.succeed(FreshServiceConfig, opts);

const handleRetry = Effect.fnUntraced(function* (err: HttpClientError) {
    if (err.response?.status === 429) {
        const retrySecs = parseInt(err.response.headers["retry-after"]!, 10);
        yield* Effect.logWarning(`Freshservice returned 429 response. Retry (sec): ${retrySecs}`);
        return Duration.seconds(retrySecs);
    }
    return Duration.zero;
});

/**
 * A FreshService Service that returns an authenticated Effect HttpClient.
 * Handles rate limiting. Will throw on other 4xx and 5xx responses.
 * 
 * Comes with a MakeStream utility method to automatically traverse API paganition
 * as an Effect Stream.
 */
export class FreshService extends Context.Service<FreshService>()("effect-services/freshservice/index/FreshService", {
    make: Effect.gen(function* () {
        const config = yield* FreshServiceConfig;

        const token = unravel(config.token);

        const RetryPolicy = Schedule.identity<HttpClientError>().pipe(
            Schedule.addDelay((e) => handleRetry(e))
        );

        const client = (yield* HttpClient.HttpClient).pipe(
            HttpClient.mapRequest(flow(
                HttpClientRequest.prependUrl(config.baseURL),
                HttpClientRequest.setHeader("Authorization", `Basic ${token}`),
                HttpClientRequest.acceptJson,
            )),
            HttpClient.filterStatusOk,
            HttpClient.retryTransient({
                retryOn: "errors-only",
                schedule: RetryPolicy
            }),
        );

        const GenericListSchema = Schema.Record(Schema.String, Schema.Array(Schema.Unknown));
        const decode = Schema.decodeUnknownEffect(GenericListSchema);


        const MakeStream = (
            path: string,
            queryParams?: SearchParamInput
        ) => Effect.gen(function* () {

            const initialURL = new URL(path, config.baseURL);

            if (queryParams) {
                initialURL.search = new URLSearchParams(queryParams).toString()
            }

            initialURL.searchParams.set("per_page", "100");

            // URL without origin (origin is already set in client)

            const stream = Stream.paginate(initialURL, (currentURL) => Effect.gen(function* () {
                yield* Effect.logDebug("FreshService Stream URL:", currentURL);

                const response = yield* client.get(removeOrigin(currentURL));
                const json = yield* response.json;

                const validated = yield* decode(json);

                const key = Object.keys(validated)[0]!;
                const responseArr = validated[key]!;

                const linkHeader = response.headers["link"];

                const nextURL = linkHeader ? extractLinkValue(linkHeader) : Option.none();

                return [responseArr, nextURL];
            }));
            return stream;
        })

        return {
            client,
            MakeStream,
        }

    })
}) {
    static readonly layer = (opts: FreshServiceConfigOpts) => Layer.effect(this, this.make).pipe(
        Layer.provide(FetchHttpClient.layer),
        Layer.provide(FreshServiceConfigLayer(opts))
    );
}
