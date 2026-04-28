import { SecretClient } from "@azure/keyvault-secrets";
import { Cache, ConfigProvider, Context, Data, Effect, flow, Layer } from "effect";
import { type TokenCredential } from "@azure/identity";
import { SourceError } from "effect/ConfigProvider";

export class KeyVaultError extends Data.TaggedError("keyVaultError")<{
    cause?: unknown;
    message?: string;
}> { }

interface KeyVaultImpl {
    use: <T>(
        fn: (client: SecretClient) => T
    ) => Effect.Effect<Awaited<T>, KeyVaultError>
};

export interface KeyVaultOpts {
    vaultURL: string | URL;
    credential: TokenCredential;
};

class KeyVaultConfig extends Context.Service<
    KeyVaultConfig,
    KeyVaultOpts
>()("effect-services/keyvault/KeyVaultConfig") { };

export const KvConfigLayer = (
    opts: KeyVaultOpts
) => Layer.succeed(KeyVaultConfig, opts);

export class KeyVault extends Context.Service<KeyVault>()("effect-services/keyvault/KeyVault", {
    make: Effect.gen(function* () {
        const config = yield* KeyVaultConfig;
        const url = config.vaultURL.toString();
        const _client = new SecretClient(url, config.credential);

        const caller: KeyVaultImpl = {
            use: (fn) => Effect.gen(function* () {
                const result = yield* Effect.try({
                    try: () => fn(_client),
                    catch: (e) => new KeyVaultError({
                        cause: e,
                        message: "Syncronous error in KeyVault.use"
                    })
                });

                if (result instanceof Promise) {
                    return yield* Effect.tryPromise({
                        try: () => result,
                        catch: (e) => new KeyVaultError({
                            cause: e,
                            message: "Asyncronous error in KeyVault.use",
                        })
                    });
                } else {
                    return result;
                }
            })
        }
        return caller;
    })
}) {
    static readonly layer = (opts: KeyVaultOpts) => Layer.effect(this, this.make).pipe(
        Layer.provide(KvConfigLayer(opts))
    )
}

export type CacheOptions = Omit<Parameters<typeof Cache["make"]>[0], "lookup">;

export class KeyVaultAsCache extends Context.Service<KeyVaultAsCache>()("effect-services/keyvault/new/KeyVaultAsCache", { 
    make: Effect.fn(function* (options: CacheOptions) {
        const kv = yield* KeyVault;
        const cache = yield* Cache.make({
            ...options,
            lookup: (key: string) => kv.use((c) => c.getSecret(key))
        });
        return cache;
    })
}){
    static readonly layer = (cacheOptions: CacheOptions) => Layer.effect(this, this.make(cacheOptions))
}

const MakeConfigHandler = (keyVaultOpts: KeyVaultOpts) => Effect.fn(function* (path: ConfigProvider.Path) {
    const kv = yield* KeyVault;
    const key = path.join("");
    yield* Effect.log("Fetching key:", key);
    const secret = yield* kv.use((c) => c.getSecret(key)).pipe(Effect.map((s) => s.value));

    if (!secret) return undefined;

    return ConfigProvider.makeValue(secret);
}, flow(
    Effect.mapError((e) => new SourceError({
        message: "Underlying Key Vault Service errored.",
        cause: e,
    })),
    Effect.provide(KeyVault.layer(keyVaultOpts)),
));

/**
 * A ConfigProvider factory which uses an underlying KeyVault service.
 * 
 * Warning!
 * Only supports Config.string constructors.
 * i.e. 
 * 
 * Supported:
 * `const secret = yield* Config.string("foo");`
 * 
 * Not Supported:
 * `const secret = yield* Config.number("foo");`
 * 
 * @example
 * const provider = MakeKeyVaultProvider({
 *      vaultURL: "https://example.vault.azure.net/"
 *      credential: new DefaultAzureCredential()
 * });
 * 
 * const providerLayer = ConfigProvider.layer(provider);
 * 
 * Effect.gen(function* () {
 *      const secret = yield* Config.string("service-prod-key");
 *      yield* Effect.log("Secret:", secret);
 * }).pipe(
 *      Effect.provide(layer),
 *      Effect.runPromise
 * );
 */
export const MakeKeyVaultProvider = (
    opts: KeyVaultOpts
) => ConfigProvider.make((p) => MakeConfigHandler(opts)(p));
