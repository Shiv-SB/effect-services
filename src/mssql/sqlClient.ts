import { Context, Effect, Layer, Stream } from "effect";
import sql from "mssql";
import { MsSqlConfig, MsSqlConfigLayer, MsSqlError, type MsSqlConfigOpts } from "./common";

export class MsSqlClient extends Context.Service<MsSqlClient>()("effect-services/mssql/sqlClient/MsSql", {
    make: Effect.gen(function* () {
        const config = yield* MsSqlConfig;

        const MakePool = Effect.gen(function* () {
            const connect = Effect.tryPromise({
                try: () => sql.connect(config),
                catch: (e) => new MsSqlError({
                    cause: e,
                    message: "MsSQL service unable to connect",
                    reason: "CONNECTION_ERROR",
                })
            });
            const pool = yield* connect;
            return pool;
        });

        const MakeStream = Effect.fn(function* (sqlQuery: string) {
            const pool = yield* MakePool;
            const req = pool.request();
            req.stream = true;
            const iterator = req.toReadableStream().iterator();
            const stream = Stream.fromAsyncIterable(iterator, (e) => new MsSqlError({
                cause: e,
                reason: "STREAM_ERROR",
                message: "Failure in mssql SDK -> Effect Stream conversion"
            }));

            // Why not Effect.tryPromise? Because if the req is awaited
            // it completes the entires stream prematurely.
            const runQuery = Effect.try({
                try: () => req.query(sqlQuery),
                catch: (e) => new MsSqlError({
                    cause: e,
                    reason: "QUERY_ERROR",
                    message: "'MsSqlClient.MakeStream' unable to run given SQL query"
                })
            });

            yield* runQuery;
            return stream;
        });

        return {
            MakePool,
            MakeStream,
        }

    })
}) {
    static readonly layer = (opts: MsSqlConfigOpts) => Layer.effect(this, this.make).pipe(
        Layer.provide(MsSqlConfigLayer(opts))
    );
}