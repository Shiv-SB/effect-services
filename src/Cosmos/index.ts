import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Data from "effect/Data";
import * as Context from 'effect/Context';
import * as Layer from "effect/Layer";
import * as Config from "effect/Config";
import * as Cache from "effect/Cache";
import { Container, CosmosClient, type ItemDefinition } from "@azure/cosmos";

export class CosmosError extends Data.TaggedError("CosmosError")<{
    cause?: unknown;
    message: string;
}> {}

export class CosmosConfig extends Context.Tag("effect-azure-kv/Cosmos/index/CosmosConfig")<CosmosConfig, {
    readonly connectionString: Redacted.Redacted<string>;
    readonly databaseID: string;
}>(){}

interface CosmosContainerImpl {
    use: <T>(
        fn: (client: Container) => T
    ) => Effect.Effect<Awaited<T>, CosmosError, never>
};

export class CosmosContainer extends Context.Tag("effect-azure-kv/Cosmos/index/CosmosContainer")<
    CosmosContainer, 
    CosmosContainerImpl
>(){}

type ContainerClientArgs = {
    connectionString: string;
    databaseID: string;
    containerID: string;
}

const makeContainer = (
    options: ContainerClientArgs
) => Effect.gen(function* () {
    const client = new CosmosClient(options.connectionString)
        .database(options.databaseID)
        .container(options.containerID);

    return CosmosContainer.of({
        use: (fn) => Effect.gen(function* () {
            const result = yield* Effect.try({
                try: () => fn(client),
                catch: (e) => new CosmosError({
                    cause: e,
                    message: "Syncronous error in 'CosmosContainer.use'"
                })
            });

            if (result instanceof Promise) {
                return yield* Effect.tryPromise({
                    try: () => result,
                    catch: (e) => new CosmosError({
                        cause: e,
                        message: "Asyncronous error in 'CosmosContainer.use'"
                    })
                });
            } else {
                return result;
            }
        })
    })
});

export const containerLayer = (
    options: ContainerClientArgs
) => Layer.scoped(CosmosContainer, makeContainer(options));

export class Cosmos extends Effect.Service<Cosmos>()("Cosmos", {
    effect: Effect.gen(function* () {
        const config = yield* CosmosConfig;
        const conStr = Redacted.value(config.connectionString);
        const dbID = config.databaseID;
        const client = new CosmosClient(conStr);
        const _database = client.database(dbID);

        const container = (containerName: string) => Effect.gen(function* () {
            const _container = _database.container(containerName);

            const upsert = <T extends ItemDefinition>(record: T) => Effect.gen(function* () {
                const req = Effect.tryPromise({
                    try: () => _container.items.upsert<T>(record, { disableAutomaticIdGeneration: true }),
                    catch(err) {
                        return new CosmosError({
                            cause: err,
                            message: "Error upserting record"
                        });
                    },
                });
                return yield* req;
            });

            return {
                client: _container,
                upsert,
            }
        });

        const checkConnection = Effect.gen(function* () {
            const check = Effect.tryPromise({
                try: () => _database.read(),
                catch(err) {
                    new CosmosError({
                        cause: err,
                        message: "Error checking Cosmos connection"
                    });
                },
            });

            const result = yield* check;
            const isOK = 200 <= result.statusCode && result.statusCode <= 200;
            return isOK;
        });

        return {
            internals: {
                _database,
                client,
            },
            container,
            checkConnection,
        } as const;
    }),
}) {};

export const containerFromEnv = Layer.scoped(
    CosmosContainer,
    Effect.gen(function* () {
        const args: ContainerClientArgs = {
            connectionString: yield* Config.string("COSMOS_CONNECTION_STRING"),
            containerID: yield* Config.string("COSMOS_CONTAINER_ID"),
            databaseID: yield* Config.string("COSMOS_DATABASE_ID"),
        };
        return yield* makeContainer(args);
    })
)

export class CosmosContainerAsCache extends Effect.Service<CosmosContainerAsCache>()("effect-azure-kv/Cosmos/index/CosmosContainerAsCache", {
    dependencies: [containerFromEnv],
    effect: (
        options: Omit<Parameters<typeof Cache["make"]>[0], "lookup">
    ) => Effect.gen(function* () {
        const container = yield* CosmosContainer;
        const cache = yield* Cache.make({
            ...options,
            lookup: (
                opts: { id: string; partitionID?: string }
            ) => container.use((c) => c.item(opts.id, opts.partitionID).read())
        });
        return cache;
    })
}){}