import { SecretClient } from "@azure/keyvault-secrets";
import { Cache, ConfigProvider, Context, Data, Effect, flow, Layer, Result } from "effect";
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

export class KeyVault extends Context.Service<KeyVault>()("effect-services/keyvault/index/KeyVault", {
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

export class KeyVaultAsCache extends Context.Service<KeyVaultAsCache>()("effect-services/keyvault/index/KeyVaultAsCache", {
    make: Effect.fn("keyvaultcache.make")(function* (options: CacheOptions) {
        const kv = yield* KeyVault;
        const cache = yield* Cache.make({
            ...options,
            lookup: (key: string) => kv.use((c) => c.getSecret(key))
        });
        return cache;
    })
}) {
    static readonly layer = (cacheOptions: CacheOptions) => Layer.effect(this, this.make(cacheOptions))
}

interface MakeConfigHandlerOpts extends KeyVaultOpts {
    /**
     * The underlying KeyVault implementation may throw on error network
     * errors or missing secrets. To return a `SourceError` in these cases, set this to `throw`.
     * 
     * Setting this to `passthrough` will not return a `SourceError` but instead
     * an `undefined`. This allows downstream handling where permitted, i.e with
     * a fallback ConfigProvider
     * 
     * @default "passthrough"
     */
    onKeyVaultError?: "passthrough" | "throw"
}

const sourceErrorText = "Underlying Key Vault Service errored. " + 
    "To allow this ConfigProvider to fallback, set 'onKeyVaultError' to 'passthrough'.";

const MakeConfigHandler = (
    keyVaultOpts: MakeConfigHandlerOpts
) => Effect.fn("keyvault.configprovider")(function* (path: ConfigProvider.Path) {
    const kv = yield* KeyVault;

    const { 
        onKeyVaultError = "passthrough"
    } = keyVaultOpts;

    const key = path.join("");

    const getSecret = yield* kv.use((c) => c.getSecret(key)).pipe(Effect.result);

    if (Result.isFailure(getSecret)) {
        if (onKeyVaultError === "throw") {
            return yield* new SourceError({
                message: sourceErrorText,
                cause: getSecret.failure,
            });
        } else {
            return undefined;
        }
    }

    const secret = getSecret.success.value;

    if (!secret) return undefined;

    return ConfigProvider.makeValue(secret);
}, flow(
    Effect.provide(KeyVault.layer(keyVaultOpts)),
    Effect.catchIf(() => keyVaultOpts.onKeyVaultError === "passthrough", () => Effect.undefined)
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
 *      vaultURL: "https://example.vault.azure.net/",
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
    opts: MakeConfigHandlerOpts
) => ConfigProvider.make((p) => MakeConfigHandler(opts)(p));