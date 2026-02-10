import * as Effect from "effect/Effect";
import * as Config from "effect/Config";
import * as Data from "effect/Data";
import { Cause, ConfigError, ConfigProvider, Layer, Logger, pipe } from "effect";
import { SecretClient } from "@azure/keyvault-secrets";
import { DefaultAzureCredential } from "@azure/identity";

export class KeyVaultError extends Data.TaggedError("KeyVaultError")<{
    cause?: unknown;
    message?: string;
}> { }

export class KeyVaultConfigProviderError extends Data.TaggedError("KeyVaultConfigProviderError")<{
    message?: string;
}> { };

class AzureKV extends Effect.Service<AzureKV>()("effect-azure-kv/index/AzureKV", {
    //accessors: true,
    effect: Effect.gen(function* () {
        const url = yield* Config.url("KV_URL");
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
    // @ts-ignore idek
    load(path, _config, _split) {
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

            return [secret.value];
        }).pipe(
            Effect.catchTag("KeyVaultError", (e) =>
                Effect.fail(
                    ConfigError.SourceUnavailable(
                        path as string[],
                        e.message ?? "Azure Key Vault unavailable",
                        Cause.fail(e)
                    )
                )
            ));
    },
    patch: {
        _tag: "Empty",
    }
});

const AzureConfigProvider = ConfigProvider.fromFlat(AzureConfigFlatProvider);

const main = Effect.gen(function* () {
    const test1 = yield* Config.string("TEST-01");
    const test2 = yield* Config.string("TEST-02");
    yield* Effect.log({ test1, test2 });
});

const Layers = Layer.mergeAll(
    AzureKV.Default,
    Logger.pretty,
);

const jsonProvider = ConfigProvider.fromJson({
    "TEST-01": "foo",
    "TEST-02": "bar",
});

const Provider = ConfigProvider.orElse(
    AzureConfigProvider,
    () => jsonProvider,
)

pipe(
    main,
    Effect.withConfigProvider(Provider),
    Effect.provide(Layers),
    Effect.runPromise,
);