import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Layer from "effect/Layer";
import * as S from "effect/Schema";
import * as Duration from "effect/Duration";
import * as Schedule from "effect/Schedule";
import * as Stream from "effect/Stream";
import * as Option from "effect/Option";
import * as Context from "effect/Context";
import { FetchHttpClient, HttpClient, HttpClientResponse } from "@effect/platform";
import { pipe } from "effect";
import type { HttpClientError } from "@effect/platform/HttpClientError";

function extractLinkValue(linkHeaderValue: string): URL | null {
    const match = linkHeaderValue.match(/<([^>]+)>/);
    if (match && match[1]) {
        return new URL(match[1]);
    } else {
        return null;
    }
}

const RetryPolicy = Schedule.identity<HttpClientError>().pipe(
    Schedule.addDelayEffect((err) => Effect.gen(function* () {
        if (err._tag === "ResponseError" && err.response.status === 429) {
            const retrySec = parseInt(err.response.headers["retry-after"]!, 10);
            yield* Effect.logWarning(`Freshservice returned 429 response. Retry (sec): ${retrySec}`);
            return Duration.seconds(retrySec);
        }
        return "0 millis";
    }))
);

type StreamFactoryArgs<Dec, Enc> = {
    path: string;
    queryParams?: ConstructorParameters<typeof URLSearchParams>[0];
    schema: S.Schema<Dec, Enc>;
};

export class FreshServiceConfig extends Context.Tag("effect-azure-kv/FreshService/index/FreshServiceConfig")<FreshServiceConfig, {
    readonly baseURL: URL;
    readonly token: Redacted.Redacted<string>;
}>(){}

export class Freshservice extends Effect.Service<Freshservice>()("Freshservice", {
    effect: Effect.gen(function* () {
        const config = yield* FreshServiceConfig;
        const baseURL = config.baseURL;
        const token = `Basic ${Redacted.value(config.token)}`;

        const FS_Layer = FetchHttpClient.layer.pipe(
            Layer.provide(
                Layer.succeed(FetchHttpClient.RequestInit, {
                    headers: {
                        "Authorization": token,
                    },
                })
            )
        );

        const client = yield* pipe(
            HttpClient.HttpClient,
            Effect.provide(FS_Layer),
        );

        const generateStream = <D, E>(
            args: StreamFactoryArgs<D, E>
        ) => Effect.gen(function* () {
            // link header value example (null if last page):
            // "<https://hcrlaw.freshservice.com/api/v2/tickets?page=2>; rel=\"next\""

            const {
                path,
                queryParams,
                schema,
            } = args;

            const initialURL = new URL(path, baseURL);

            if (queryParams) {
                initialURL.search = new URLSearchParams(queryParams).toString();
            }

            initialURL.searchParams.set("per_page", "100");

            const decode = HttpClientResponse.schemaBodyJson(schema);

            const stream = Stream.paginateEffect(
                initialURL,
                (currentURL) => Effect.gen(function* () {
                    yield* Effect.log(currentURL.toString());

                    const response = yield* client.get(currentURL).pipe(
                        Effect.flatMap(HttpClientResponse.filterStatus((res) => res !== 429)),
                        Effect.retry(RetryPolicy)
                    );                    

                    const decoded = yield* decode(response);

                    const linkHeader = response.headers["link"];
                    const nextUrl = linkHeader ? extractLinkValue(linkHeader) : null;

                    // Return the decoded data and optional next URL
                    // When nextUrl is null, returns Option.none() to stop pagination
                    return [decoded, Option.fromNullable(nextUrl)] as const;
                }),
            ).pipe(
                Stream.onEnd(Effect.log(`Stream complete for ${args.path}`))
            );

            return stream;
        });

        return {
            baseURL,
            client,
            generateStream,
        };
    }).pipe(
        Effect.provide(FetchHttpClient.layer)
    ),
}) { };