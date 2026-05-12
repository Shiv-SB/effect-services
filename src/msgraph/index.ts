import { Client, GraphRequest } from "@microsoft/microsoft-graph-client";
import { Effect, Data, Context, Layer, Schema as S, Stream, Schedule, Option } from "effect";
import { unravel, type RedactedOr } from "../internals/helpers";
import { ClientSecretCredential } from "@azure/identity";
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';

export class MsGraphError extends Data.TaggedError("MsGraphError")<{
    cause?: unknown;
    message: string;
}> { }

interface MsGraphImpl {
    use: <T>(
        fn: (client: Client) => T
    ) => Effect.Effect<Awaited<T>, MsGraphError, never>
}

interface MsGraphConfigOpts {
    readonly tenantID: string;
    readonly clientID: string;
    readonly clientSecret: RedactedOr<string>;
    readonly scopes: string[];
}

class MsGraphConfig extends Context.Service<MsGraphConfig, MsGraphConfigOpts>()("effect-services/msgraph/index/MsGraphConfig") { }

const MsGraphConfigLayer = (opts: MsGraphConfigOpts) => Layer.succeed(MsGraphConfig, opts);

export class MsGraph extends Context.Service<MsGraph>()("effect-services/msgraph/index/MsGraph", {
    make: Effect.gen(function* () {
        const c = yield* MsGraphConfig;
        const credential = new ClientSecretCredential(
            c.tenantID,
            c.clientID,
            unravel(c.clientSecret),
        );

        const authProvider = new TokenCredentialAuthenticationProvider(credential, { scopes: c.scopes });

        const client = Client.initWithMiddleware({ authProvider });

        const caller: MsGraphImpl = {
            use: (fn) => Effect.gen(function* () {
                const result = yield* Effect.try({
                    try: () => fn(client),
                    catch: (e) => new MsGraphError({
                        cause: e,
                        message: "Syncronous error in MsGraph.use'"
                    })
                });

                if (result instanceof Promise) {
                    return yield* Effect.tryPromise({
                        try: () => result,
                        catch: (e) => new MsGraphError({
                            cause: e,
                            message: "Asyncronous error in 'MsGraph.use'"
                        })
                    })
                } else {
                    return result;
                }
            })
        }
        return caller;
    })
}) {
    static readonly layer = (opts: MsGraphConfigOpts) => Layer.effect(this, this.make).pipe(
        Layer.provide(MsGraphConfigLayer(opts))
    )
}

export const PaginationFields = S.Struct({
    "@odata.context": S.URLFromString,
    "@odata.nextLink": S.optional(S.URLFromString),
    value: S.Array(S.Unknown)
});

export const MakeStream = Effect.fn(function* (request: GraphRequest) {
    const graph = yield* MsGraph;
    const decode = S.decodeUnknownEffect(PaginationFields);

    const stream = Stream.paginate(request, (req) => Effect.gen(function* () {
        const GetResponse = Effect.tryPromise({
            try: () => req.get(),
            catch: (e) => new MsGraphError({
                cause: e,
                message: "MakeStream unable to process given request"
            })
        }).pipe(
            Effect.retry({ times: 3, schedule: Schedule.exponential(1) })
        );

        const response = yield* GetResponse;
        const json = yield* decode(response);

        const rawNextLink: URL | undefined = json["@odata.nextLink"];

        const next = rawNextLink
            ? Option.some(yield* graph.use((c) => c.api(rawNextLink.href)))
            : Option.none();

        return [json.value, next];
    }));

    return stream;
});