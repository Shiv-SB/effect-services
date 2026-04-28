import { type CosmosClient } from "@azure/cosmos";
import { Context, Effect, Layer, Redacted } from "effect";
import { CosmosClient as _client } from "@azure/cosmos";
import { CosmosError } from "./common";

export interface CosmosSDKConfigOpts {
    connectionString: string | Redacted.Redacted<string>;
}

export class CosmosSDKConfig extends Context.Service<CosmosSDKConfig, CosmosSDKConfigOpts>()("effect-services/cosmos/new/CosmosSDKConfig"){}

const CosmosSDKConfigLayer = (opts: CosmosSDKConfigOpts) => Layer.succeed(CosmosSDKConfig, opts);

interface CosmosSdkImpl {
    use: <T>(
        fn: (client: CosmosClient) => T
    ) => Effect.Effect<Awaited<T>, CosmosError, never>
}

export class CosmosClientSDK extends Context.Service<CosmosClientSDK>()("effect-services/cosmos/new/CosmosClientSDK", {
    make: Effect.gen(function* () {
        const c = yield* CosmosSDKConfig;
        
        const connStr: string = Redacted.isRedacted(c.connectionString)
            ? Redacted.value(c.connectionString)
            : c.connectionString;

        const client = new _client(connStr);

        const caller: CosmosSdkImpl =  {
            use: (fn) => Effect.gen(function* () {
                const result = yield* Effect.try({
                    try: () => fn(client),
                    catch: (e) => new CosmosError({
                        cause: e,
                        message: "Syncronous error in 'CosmosClientSDK.use'",
                        source: "COSMOS_CLIENT_SDK",
                    })
                });

                if (result instanceof Promise) {
                    return yield* Effect.tryPromise({
                        try: () => result,
                        catch: (e) => new CosmosError({
                            cause: e,
                            message: "Asyncronous error in 'CosmosClientSDK.use'",
                            source: "COSMOS_CLIENT_SDK",
                        })
                    });
                } else {
                    return result;
                }
            })
        };
        return caller;
    })
}){
    static readonly layer = (opts: CosmosSDKConfigOpts) => Layer.effect(this, this.make).pipe(
        Layer.provide(CosmosSDKConfigLayer(opts))
    )
}

Effect.fn(function* () {
    const c = yield* CosmosClientSDK;
    const f = yield* c.use((c) => c.getReadEndpoint());
    yield* Effect.log(f);
});