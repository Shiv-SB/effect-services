import { Context, Effect, Layer } from 'effect';
import sql from 'mssql';
import { MsSqlConfig, MsSqlConfigLayer, MsSqlError, type MsSqlConfigOpts } from './common';

interface MsSqlSDKImpl {
    use: <T>(
        fn: (client: sql.ConnectionPool) => T
    ) => Effect.Effect<Awaited<T>, MsSqlError, never>
}

export class MsSqlSDK extends Context.Service<MsSqlSDK>()("effect-services/mssql/sqlSDK/MsSqlSDK", {
    make: Effect.gen(function* () {
        const config = yield* MsSqlConfig;

        const pool = yield* Effect.tryPromise({
            try: () => sql.connect(config),
            catch: (e) => new MsSqlError({
                cause: e,
                message: "MsSqlSDK service unable to connect",
                reason: "CONNECTION_ERROR"
            })
        });

        const caller: MsSqlSDKImpl = {
            use: (fn) => Effect.gen(function* () {
                const result = yield* Effect.try({
                    try: () => fn(pool),
                    catch: (e) => new MsSqlError({
                        cause: e,
                        message: "Syncronous error in 'MsSqlSDK.use'",
                        reason: "SYNC_ERROR",
                    })
                });

                if (result instanceof Promise) {
                    return yield* Effect.tryPromise({
                        try: () => result,
                        catch: (e) => new MsSqlError({
                            cause: e,
                            message: "Asyncronous error in 'MsSqlSDK.use'",
                            reason: "ASYNC_ERROR",
                        })
                    })
                } else {
                    return result;
                }
            })
        }
        return caller;
    })
}){
    static readonly layer = (opts: MsSqlConfigOpts) => Layer.effect(this, this.make).pipe(
        Layer.provide(MsSqlConfigLayer(opts))
    );
}