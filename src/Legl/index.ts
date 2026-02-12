import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as Option from "effect/Option";
import * as Either from "effect/Either";
import * as Context from "effect/Context";
import * as R from "effect/Redacted";
import { FetchHttpClient, HttpClient, HttpClientResponse } from '@effect/platform';
import { LeglPaginationFieldsWithResult } from "./schema";

type StreamArgs = {
    path: string;
    queryParams?: ConstructorParameters<typeof URLSearchParams>[0];
}

export class LeglConfig extends Context.Tag("effect-azure-kv/Legl/index/LeglConfig")<LeglConfig, {
    readonly baseURL: URL;
    readonly bearerToken: R.Redacted<string>;
}>(){}

export class LeglService extends Effect.Service<LeglService>()("effect-azure-kv/Legl/index/LeglService", {
    effect: Effect.gen(function* () {
        const conf = yield* LeglConfig;
        const baseURL = conf.baseURL;

        const HttpLayer = FetchHttpClient.layer.pipe(
            Layer.provide(
                Layer.succeed(FetchHttpClient.RequestInit, {
                    headers: {
                        "authorization": `Token ${R.value(conf.bearerToken)}`,
                    }
                })
            )
        );

        const client = yield* HttpClient.HttpClient.pipe(
            Effect.provide(HttpLayer)
        );

        const StreamFactory = (
            args: StreamArgs
        ) => Effect.gen(function* () {
            const {
                path,
                queryParams,
            } = args;

            const initialURL = new URL(path, baseURL);

            if (queryParams) {
                initialURL.search = new URLSearchParams(queryParams).toString();
            }

            const decode = HttpClientResponse.schemaBodyJson(LeglPaginationFieldsWithResult);

            const stream = Stream.unfoldEffect(
                initialURL,
                (currentUrl) => Effect.gen(function* () {
                    if (!currentUrl) return Option.none();

                    yield* Effect.log(currentUrl.toString());
                    const response = yield* client.get(currentUrl);
                    const decoded = yield* Effect.either(decode(response));

                    if (Either.isLeft(decoded)) {
                        yield* Effect.logError(decoded.left.message);
                        if (decoded.left._tag === "ParseError") {
                            yield* Effect.log("Actual:", decoded.left.issue.actual);
                        }
                        return Option.none();
                    }

                    const nextUrl = decoded.right.next;

                    return Option.some([
                        decoded.right,
                        nextUrl!,
                    ]);
                })
            ).pipe(
                Stream.onEnd(Effect.log(`Legl stream complete`)),
                Stream.withSpan(args.path),
            );

            return stream;
        });

        return {
            client,
            baseURL,
            StreamFactory,
        }
    }).pipe(Effect.provide(FetchHttpClient.layer)),
}) { }