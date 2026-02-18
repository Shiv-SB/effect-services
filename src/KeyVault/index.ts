import { SecretClient, type SecretClientOptions } from "@azure/keyvault-secrets";
import { DefaultAzureCredential, type TokenCredential } from "@azure/identity";
import * as Cache from "effect/Cache";
import * as Config from "effect/Config";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HashSet from "effect/HashSet";

export class KeyVaultError extends Data.TaggedError("KeyVaultError")<{
    cause?: unknown;
    message?: string;
}> { }

interface KeyVaultImpl {
    use: <T>(
        fn: (client: SecretClient) => T
    ) => Effect.Effect<Awaited<T>, KeyVaultError, never>
}

export class KeyVault extends Context.Tag("effect-services/client/KeyVault")<
    KeyVault,
    KeyVaultImpl
>() { }

type SecretClientArgs = {
    vaultURL: string;
    credential: TokenCredential;
    pipelineOptions?: SecretClientOptions;
};

export const make = (
    options: SecretClientArgs
) => Effect.gen(function* () {
    const client = new SecretClient(
        options.vaultURL,
        options.credential,
        options.pipelineOptions
    );

    return KeyVault.of({
        use: (fn) => Effect.gen(function* () {
            const result = yield* Effect.try({
                try: () => fn(client),
                catch: (e) => new KeyVaultError({
                    cause: e,
                    message: "Syncronous error in 'KeyVault.use'"
                })
            });

            if (result instanceof Promise) {
                return yield* Effect.tryPromise({
                    try: () => result,
                    catch: (e) => new KeyVaultError({
                        cause: e,
                        message: "Asyncronous error in 'KeyVault.use'"
                    })
                });
            } else {
                return result;
            }
        })
    });
});

export const layer = (
    options: SecretClientArgs
) => Layer.scoped(KeyVault, make(options));

export const fromEnv = Layer.scoped(
    KeyVault,
    Effect.gen(function* () {
        const url = yield* Config.url("KV_URL")
        return yield* make({
            vaultURL: url.href,
            credential: new DefaultAzureCredential()
        }).pipe(
            Effect.withConfigProvider(ConfigProvider.fromEnv()),
        );
    })
);

export class KeyVaultAsCache extends Effect.Service<KeyVaultAsCache>()("effect-services/client/KeyVaultAsCache", {
    dependencies: [fromEnv],
    effect: (options: Omit<Parameters<typeof Cache["make"]>[0], "lookup">) => Effect.gen(function* () {
        const kv = yield* KeyVault;
        const cache = yield* Cache.make({
            ...options,
            lookup: (key: string) => kv.use((c) => c.getSecret(key)),
        });
        return cache;
    })
}) { }

// #region ConfigProvider

export const makeAzureKvProvider = (
    options: SecretClientArgs
): ConfigProvider.ConfigProvider => {
    const client = new SecretClient(
        options.vaultURL,
        options.credential,
        options.pipelineOptions
    );

    return ConfigProvider.fromFlat(
        ConfigProvider.makeFlat({
            // @ts-ignore Using generic breaks the below args for some reason
            load: <A>(path, _conf, _split) => Effect.tryPromise({
                try: async () => {
                    const secretName = path.join("--");
                    const secret = await client.getSecret(secretName);
                    return [secret.value ?? ""] as A[];
                },
                catch: (_e) => [] as A[]
            }).pipe(Effect.orElseSucceed(() => [] as A[])),
            enumerateChildren: (_path) => Effect.succeed(HashSet.empty()),
            patch: {
                _tag: "Empty"
            }
        })
    );
}