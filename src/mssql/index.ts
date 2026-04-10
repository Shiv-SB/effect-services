import sql from "mssql";
import * as Effect from "effect/Effect";
import * as Data from "effect/Data";
import * as Stream from "effect/Stream";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";

export class MsSqlError extends Data.TaggedError("MsSqlError")<{
    message: string;
    cause: unknown;
    reason: "CONNECTION_ERROR" 
        |"STREAM_ERROR" 
        | "QUERY_ERROR"
        | "SYNC_ERROR"
        | "ASYNC_ERROR";
}> { }

export class MsSql extends Effect.Service<MsSql>()("effect-services/mssql/index/MsSql", {
    effect: Effect.gen(function* () {
        const makePool = (
            config: sql.config
        ) => Effect.gen(function* () {
            const connect = Effect.tryPromise({
                try: () => sql.connect(config),
                catch: (err) => new MsSqlError({
                    cause: err,
                    message: "MsSQL service unable to connect",
                    reason: "CONNECTION_ERROR",
                })
            });

            const pool = yield* connect;
            return pool;
        });

        const makeStream = (
            config: sql.config,
            sqlQuery: string
        ) => Effect.gen(function* () {
            const pool = yield* makePool(config);
            const req = pool.request();
            req.stream = true;
            const iterator = req.toReadableStream().iterator();
            const stream = Stream.fromAsyncIterable(iterator, (e) => new MsSqlError({
                cause: e,
                message: "MsSql service failure in mssql SDK to Effect Stream conversion",
                reason: "STREAM_ERROR",
            }));

            const runQuery = Effect.try({
                try: () => req.query(sqlQuery),
                catch: (err) => new MsSqlError({
                    cause: err,
                    message: "MsSql service unable to run given SQL query",
                    reason: "QUERY_ERROR"
                })
            });

            yield* runQuery;
            return stream;
        });

        return {
            makePool,
            makeStream,
        };
    })
}) { }

// #region MsSqlClient

interface MsSqlClientImpl {
    use: <T>(
        fn: (client: sql.ConnectionPool) => T
    ) => Effect.Effect<Awaited<T>, MsSqlError, never>
}

export class MsSqlClient extends Context.Tag("effect-services/mssql/index/MsSqlClient")<
    MsSqlClient,
    MsSqlClientImpl
>() { }

export const makeClient = (
    config: sql.config
) => Effect.gen(function* () {
    const createPool = Effect.tryPromise({
        try: () => sql.connect(config),
        catch: (err) => new MsSqlError({
            cause: err,
            message: "MsSQL service unable to connect",
            reason: "CONNECTION_ERROR",
        })
    });

    const pool = yield* createPool;

    return MsSqlClient.of({
        use: (fn) => Effect.gen(function* () {
            const result = yield* Effect.try({
                try: () => fn(pool),
                catch: (e) => new MsSqlError({
                    cause: e,
                    message: "Syncronous error in 'MsSqlClient.use'",
                    reason: "SYNC_ERROR",
                })
            });

            if (result instanceof Promise) {
                return yield* Effect.tryPromise({
                    try: () => result,
                    catch: (e) => new MsSqlError({
                        cause: e,
                        message: "Asyncronous error in 'MsSqlClient.use'",
                        reason: "ASYNC_ERROR",
                    })
                });
            } else {
                return result;
            }
        })
    });
});

export const clientLayer = (
    config: sql.config
) => Layer.scoped(MsSqlClient, makeClient(config));
