import { Effect, Context, type Redacted, flow, Schedule, Stream, Option, Layer } from 'effect';
import { removeOrigin, unwravel, type SearchParamInput } from "../internals/helpers";
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/unstable/http';
import { LeglPaginationFieldsWithResult } from "./schema";

interface LeglConfigOpts {
    baseURL: URL | string;
    bearerToken: Redacted.Redacted<string> | string;
}

class LeglConfig extends Context.Service<LeglConfig, LeglConfigOpts>()("effect-services/legl/new/LeglConfig"){}

const LeglConfigLayer = (opts: LeglConfigOpts) => Layer.succeed(LeglConfig, opts);

export class Legl extends Context.Service<Legl>()("effect-services/legl/new/Legl", { 
    make: Effect.gen(function* () {
        const config = yield* LeglConfig;
        const token = unwravel(config.bearerToken);
        const baseURL = config.baseURL.toString();

        const RetrySchedule = Schedule.exponential("1 second").pipe(Schedule.both(Schedule.recurs(5)));

        const client = (yield* HttpClient.HttpClient).pipe(
            HttpClient.mapRequest(flow(
                HttpClientRequest.prependUrl(baseURL),
                HttpClientRequest.setHeader("authorization", `Token ${token}`)
            )),
            HttpClient.filterStatusOk,
            HttpClient.retryTransient({
                retryOn: "errors-only",
                schedule: RetrySchedule,
                while: ((e) => e.response?.status === 429)
            })
        );

        const MakeStream = (
            path: string,
            queryParams?: SearchParamInput
        ) => Effect.gen(function* () {
            
            const initialURL = new URL(path, config.baseURL);

            if (queryParams) {
                initialURL.search = new URLSearchParams(queryParams).toString();
            }

            const decode = HttpClientResponse.schemaBodyJson(LeglPaginationFieldsWithResult);

            const stream = Stream.paginate(initialURL, (currentURL) => Effect.gen(function* () {
                const response = yield* client.get(removeOrigin(currentURL));
                const json = yield* decode(response);

                const nextURL = json.next ? Option.some(json.next) : Option.none();

                return [json.results, nextURL];
            }));

            return stream;
        });

        return {
            client,
            MakeStream,
        };
    })
}){
    static readonly layer = (opts: LeglConfigOpts) => Layer.effect(this, this.make).pipe(
        Layer.provide(LeglConfigLayer(opts))
    );
}