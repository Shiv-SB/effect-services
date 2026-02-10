import * as Effect from "effect/Effect";
import * as Config from "effect/Config";
import * as Data from "effect/Data";
import { Cause, ConfigError, ConfigProvider, Context, HashSet, Layer, Logger, pipe } from "effect";
import { SecretClient } from "@azure/keyvault-secrets";
import { DefaultAzureCredential } from "@azure/identity";

export class KeyVaultError extends Data.TaggedError("KeyVaultError")<{
    cause?: unknown;
    message?: string;
}> { }

export class KeyVaultConfigProviderError extends Data.TaggedError("KeyVaultConfigProviderError")<{
    message?: string;
}> { };

export class AzureKVConfig extends Context.Tag("effect-azure-kv/index/AzureKVConfig")<
    AzureKVConfig,
    Config.Config<URL>
>(){}

class AzureKV extends Effect.Service<AzureKV>()("effect-azure-kv/index/AzureKV", {
    //accessors: true,
    effect: Effect.gen(function* () {
        const getURL = yield* AzureKVConfig;
        const url = yield* getURL;
        const credential = new DefaultAzureCredential();
        const kvClient = new SecretClient(url.href, credential);

        const secrets = yield* Effect.gen(function* () {
            const get = (key: string) => Effect.tryPromise({
                try: () => kvClient.getSecret(key),
                catch: (e) => new KeyVaultError({
                    cause: e,
                    message: `Unable to get '${key}'`
                })
            });

            const set = (
                key: string,
                value: string
            ) => Effect.tryPromise({
                try: () => kvClient.setSecret(key, value),
                catch: (e) => new KeyVaultError({
                    cause: e,
                    message: `Unable to get '${key}'`
                })
            });

            return {
                get,
                set
            };
        });

        return {
            _internals: {
                credential,
                kvClient,
            },
            secrets,

        };
    }),
}) { }

const AzureConfigFlatProvider = ConfigProvider.makeFlat({
    load<A>(
        path: readonly string[],
        _config: Config.Config.Primitive<A>,
        _split: boolean
    //): Effect.Effect<A[], ConfigError.ConfigError, never> {
    ) {
        return Effect.gen(function* () {
            const kv = yield* AzureKV;

            const key = path.join("-");
            // or ".", or "__", or whatever convention you want

            const secret = yield* kv.secrets.get(key);

            if (!secret.value) {
                return yield* Effect.fail(
                    ConfigError.MissingData(
                        path as string[],
                        `Missing Key Vault secret: ${key}`
                    )
                );
            }

            return [secret.value] as A[];
        }).pipe(
            //Effect.provide(AzureKV.Default),
            Effect.catchTag("KeyVaultError", (e) =>
                Effect.fail(
                    ConfigError.SourceUnavailable(
                        path as string[],
                        e.message ?? "Azure Key Vault unavailable",
                        Cause.fail(e)
                    )
                )
            ),
        );
    },
    enumerateChildren: (_path) => Effect.succeed(HashSet.empty()),
    patch: {
        _tag: "Empty",
    }
});

const AzureConfigProvider = ConfigProvider.fromFlat(AzureConfigFlatProvider)

const main = Effect.gen(function* () {
    const test1 = yield* Config.string("TEST-01");
    const test2 = yield* Config.string("TEST-02");
    yield* Effect.log({ test1, test2 });
});

const AzureKVConfigLive = Layer.succeed(AzureKVConfig, Config.url("KV_URL"));

const AppLayer = Layer.mergeAll(
    AzureKV.Default,
    Logger.pretty,
).pipe(
    Layer.provideMerge(AzureKVConfigLive)
);

pipe(
    main,
    Effect.withConfigProvider(AzureConfigProvider),
    Effect.provide(AppLayer),
    Effect.runPromise,
);