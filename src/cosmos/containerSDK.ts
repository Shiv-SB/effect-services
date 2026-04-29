import { Context, Effect, Layer } from "effect";
import type { CosmosSDKConfigOpts } from "./cosmosSDK";
import type { Container } from "@azure/cosmos";
import { CosmosError } from "./common";
import { CosmosClient as _client } from "@azure/cosmos";
import { unravel } from "../internals/helpers";

interface ContainerConfigOpts extends CosmosSDKConfigOpts {
    databaseID: string;
    containerID: string;
}

class ContainerConfig extends Context.Service<ContainerConfig, ContainerConfigOpts>()("effect-services/cosmos/containerSDK/ContainerConfig") { }

const ContainerConfigLayer = (opts: ContainerConfigOpts) => Layer.succeed(ContainerConfig, opts);

interface ContainerSdkImpl {
    use: <T>(
        fn: (client: Container) => T
    ) => Effect.Effect<Awaited<T>, CosmosError, never>
}

/**
 * A lightweight, Effectful wrapper for the Cosmos Container Client.
 * Uses @azure/cosmos.
 */
export class ContainerClientSDK extends Context.Service<ContainerClientSDK>()("effect-services/cosmos/containerSDK/ContainerClientSDK", {
    make: Effect.gen(function* () {
        const config = yield* ContainerConfig;

        const client = new _client(unravel(config.connectionString))
            .database(config.databaseID)
            .container(config.containerID);

        const caller: ContainerSdkImpl = {
            use: (fn) => Effect.gen(function* () {
                const result = yield* Effect.try({
                    try: () => fn(client),
                    catch: (e) => new CosmosError({
                        cause: e,
                        message: "Syncronous error in 'ContainerClientSDK.use'",
                        source: "CONTAINER_CLIENT_SDK",
                    })
                });

                if (result instanceof Promise) {
                    return yield* Effect.tryPromise({
                        try: () => result,
                        catch: (e) => new CosmosError({
                            cause: e,
                            message: "Asyncronous error in 'ContainerClientSDK.use'",
                            source: "CONTAINER_CLIENT_SDK",
                        })
                    });
                } else {
                    return result;
                }
            })
        };
        return caller;
    })
}) {
    static readonly layer = (opts: ContainerConfigOpts) => Layer.effect(this, this.make).pipe(
        Layer.provide(ContainerConfigLayer(opts))
    )
}
