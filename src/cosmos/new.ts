import type { Container } from "@azure/cosmos";
import { Cache, Context, Data, Effect, Layer, Redacted } from "effect";
import { CosmosClient as _client } from "@azure/cosmos";

export class CosmosError extends Data.TaggedError("ComsosError")<{
    cause?: unknown;
    message: string;
}>{}

//#region Container SDK

interface ContainerConfigOpts {
    connectionString: string | Redacted.Redacted<string>;
    databaseID: string;
    containerID: string;
}

class ContainerConfig extends Context.Service<ContainerConfig, ContainerConfigOpts>()("effect-services/cosmos/new/ContainerConfig"){}

const ContainerConfigLayer = (opts: ContainerConfigOpts) => Layer.succeed(ContainerConfig, opts);

interface ContainerImpl {
    use: <T>(
        fn: (client: Container) => T
    ) => Effect.Effect<Awaited<T>, CosmosError, never>
}

/**
 * A lightweight, Effectful wrapper for the Cosmos Container Client.
 * Uses @azure/cosmos version: COSMOS_VERSION
 */
export class ContainerClientSDK extends Context.Service<ContainerClientSDK>()("effect-services/cosmos/new/ContainerClientSDK", {
    make: Effect.gen(function* () {
        const config = yield* ContainerConfig;

        const connStr: string = Redacted.isRedacted(config.connectionString)
            ? Redacted.value(config.connectionString)
            : config.connectionString;

        const client = new _client(connStr)
            .database(config.databaseID)
            .container(config.containerID);

        return {
            use: (fn) => Effect.gen(function* () {
                const result = yield* Effect.try({
                    try: () => fn(client),
                    catch: (e) => new CosmosError({
                        cause: e,
                        message: "Syncronous error in 'ContainerClientSDK.use'"
                    })
                });

                if (result instanceof Promise) {
                    return yield* Effect.tryPromise({
                        try: () => result,
                        catch: (e) => new CosmosError({
                            cause: e,
                            message: "Asyncronous error in 'ContainerClientSDK.use'"
                        })
                    });
                } else {
                    return result;
                }
            })
        } satisfies ContainerImpl
    })
}){
    static readonly layer = (opts: ContainerConfigOpts) => Layer.effect(this, this.make).pipe(
        Layer.provide(ContainerConfigLayer(opts))
    )
}

// TODO: implement Container as Cache
