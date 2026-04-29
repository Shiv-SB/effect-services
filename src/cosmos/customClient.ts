import { Context, Duration, Effect, Layer, Schedule, Stream, flow } from 'effect';
import { type CosmosSDKConfigOpts } from "./CosmosSDK";
import { CosmosClient as _client, ErrorResponse, type ItemDefinition, type SqlQuerySpec } from "@azure/cosmos";
import { CosmosError } from "./common";
import { unravel } from '../internals/helpers';

interface CosmosClientConfigOpts extends CosmosSDKConfigOpts {
    databaseID: string;
}

export class CosmosClientConfig extends Context.Service<CosmosClientConfig, CosmosClientConfigOpts>()("effect-services/cosmos/customClient/CosmosClientConfig") { }

const CosmosConfigLayer = (opts: CosmosClientConfigOpts) => Layer.succeed(CosmosClientConfig, opts);

export const RetryPolicy = Schedule.identity<CosmosError>().pipe(
    Schedule.addDelay((e) => Effect.gen(function* () {
        if (e.cause instanceof ErrorResponse) {
            if (e.cause.retryAfterInMs) {
                const dur = Duration.millis(e.cause.retryAfterInMs);
                yield* Effect.logWarning(`Rate limit reached in Cosmos Client. Retrying in: ${Duration.format(dur)}`);
                return dur;
            }
        }
        return Duration.zero;
    }))
);

export class CosmosClient extends Context.Service<CosmosClient>()("effect-services/cosmos/customClient/CosmosClient", {
    make: Effect.gen(function* () {
        const c = yield* CosmosClientConfig;

        const client = new _client(unravel(c.connectionString));
        const db = client.database(c.databaseID);

        const container = Effect.fn(function* (containerName: string) {
            const containerClient = db.container(containerName);

            const upsert = Effect.fn("cosmos_client_upsert")(function* <T extends ItemDefinition>(record: T) {
                const req = Effect.tryPromise({
                    try: () => containerClient.items.upsert<T>(record, { disableAutomaticIdGeneration: true }),
                    catch: (e) => new CosmosError({
                        cause: e,
                        message: "Error upserting record",
                        source: "COSMOS_CLIENT",
                    })
                });
                return yield* req;
            }, flow(
                Effect.retry({ schedule: RetryPolicy }),
            ));

            const allItems = Effect.gen(function* () {
                const feed = containerClient.items.readAll().getAsyncIterator();
                const stream = Stream.fromAsyncIterable(feed, (e) => new CosmosError({
                    cause: e,
                    message: "Error in allItems processing.",
                    source: "COSMOS_CLIENT",
                }));
                return stream;
            });

            const query = Effect.fn("cosmos_client_query")(function* (query: SqlQuerySpec) {
                const get = Effect.tryPromise({
                    try: () => containerClient.items.query(query).fetchAll(),
                    catch: (e) => new CosmosError({
                        cause: e,
                        message: "Error in querying records",
                        source: "COSMOS_CLIENT",
                    })
                }).pipe(
                    Effect.map((a) => a.resources as unknown[])
                );
                return yield* get;
            });

            const queryToStream = Effect.fn("cosmos_client_queryToStream")(function* (query: SqlQuerySpec) {
                const feed = containerClient.items.query(query).getAsyncIterator();
                const stream = Stream.fromAsyncIterable(feed, (e) => new CosmosError({
                    cause: e,
                    message: "Error in queryToStream processing.",
                    source: "COSMOS_CLIENT",
                }));
                return stream;
            });

            return {
                client: containerClient,
                upsert,
                queryToStream,
                query,
                allItems,
            }
        });

        return {
            container,
            database: db,
            client,
        }
    })
}) {
    static readonly layer = (opts: CosmosClientConfigOpts) => Layer.effect(this, this.make).pipe(
        Layer.provide(CosmosConfigLayer(opts))
    )
}