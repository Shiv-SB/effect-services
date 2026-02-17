import * as Config from "effect/Config";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as S from "effect/Schema";
import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";
import {
    TokenCredentialAuthenticationProvider
} from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";

export class MsGraphError extends Data.TaggedError("MsGraphError")<{
    cause?: unknown;
    message: string;
}> { }

interface MsGraphImpl {
    use: <T>(
        fn: (client: Client) => T
    ) => Effect.Effect<Awaited<T>, MsGraphError, never>
}

export class MsGraph extends Context.Tag("effect-services/MsGraph/index2/MsGraph")<
    MsGraph,
    MsGraphImpl
>() { }

type MsGraphArgs = {
    readonly tenantID: string;
    readonly clientID: string;
    readonly clientSecret: string;
    readonly scopes: string[];
}

export const make = (
    options: MsGraphArgs
) => Effect.gen(function* () {
    const creds = new ClientSecretCredential(
        options.tenantID,
        options.clientID,
        options.clientSecret
    );

    const authProvider = new TokenCredentialAuthenticationProvider(creds, {
        scopes: options.scopes
    });

    const graphClient = Client.initWithMiddleware({ authProvider });

    return MsGraph.of({
        use: (fn) => Effect.gen(function* () {
            const result = yield* Effect.try({
                try: () => fn(graphClient),
                catch: (e) => new MsGraphError({
                    cause: e,
                    message: "Syncronous error in 'MsGraph.use'"
                })
            });

            if (result instanceof Promise) {
                return yield* Effect.tryPromise({
                    try: () => result,
                    catch: (e) => new MsGraphError({
                        cause: e,
                        message: "Asyncronous error in 'MsGraph.use'"
                    })
                });
            } else {
                return result;
            }
        })
    });
});

export const layer = (
    options: MsGraphArgs
) => Layer.scoped(MsGraph, make(options));

export const fromEnv = Layer.scoped(
    MsGraph,
    Effect.gen(function* () {
        const tenantID = yield* Config.string("MSGRAPH_TENANT_ID");
        const clientID = yield* Config.string("MSGRAPH_CLIENT_ID");
        const clientSecret = yield* Config.string("MSGRAPH_CLIENT_SECRET");
        const scopes = yield* Config.array(Config.string(), "MS_GRAPH_SCOPES").pipe(
            Config.withDefault<string[]>(["https://graph.microsoft.com/.default"]),
        );

        return yield* make({
            tenantID,
            clientID,
            clientSecret,
            scopes,
        }).pipe(
            Effect.withConfigProvider(ConfigProvider.fromEnv())
        );
    })
);


// TODO: implement stream factory similar to Legl
export const PaginationFields = S.Struct({
    "@odata.context": S.URL,
    "@odata.nextLink": S.URL,
    value: S.Array(S.Unknown),
});
