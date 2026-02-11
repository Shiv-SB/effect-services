import { SecretClient, type SecretClientOptions } from "@azure/keyvault-secrets";
import { DefaultAzureCredential, type TokenCredential } from "@azure/identity";
import { Config, Context, Data, Effect, Layer, Logger, pipe } from "effect";

export class KeyVaultError extends Data.TaggedError("KeyVaultError")<{
    cause?: unknown;
    message?: string;
}>{}

interface KeyVaultImpl {
    use: <T>(
        fn: (client: SecretClient) => T
    ) => Effect.Effect<Awaited<T>, KeyVaultError, never>
}

export class KeyVault extends Context.Tag("effect-azure-kv/client/KeyVault")<
    KeyVault, 
    KeyVaultImpl
>(){}

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
) => Layer.scoped(KeyVault, make({
    credential: options.credential,
    vaultURL: options.vaultURL,
    pipelineOptions: options.pipelineOptions
}));

export const fromEnv = Layer.scoped(
    KeyVault,
    Effect.gen(function* () {
        const url = yield* Config.url("KV_URL");
        return yield* make({
            vaultURL: url.href,
            credential: new DefaultAzureCredential()
        });
    })
);