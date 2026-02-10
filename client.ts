import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import { SecretClient } from "@azure/keyvault-secrets";

export class KeyVaultError extends Data.TaggedError("KeyVaultError")<{
    cause?: unknown;
    message?: string;
}> { }

interface KeyVaultImpl {
    use: <T>(
        fn: (client: SecretClient) => T
    ) => Effect.Effect<Awaited<T>, unknown, never>;
};

export class KeyVault extends Context.Tag("effect-azure-kv/client/KeyVault")<
    KeyVault,
    KeyVaultImpl
>() { };

type KeyVaultParamsVals = ConstructorParameters<typeof SecretClient>;
type KeyVaultParamsObj = {
    vaultURL: KeyVaultParamsVals[0];
    credential: KeyVaultParamsVals[1];
    pipelineOptions?: KeyVaultParamsVals[2];
};

export const make = (
    options: KeyVaultParamsObj,
) => Effect.gen(function* () {
    const client = new SecretClient(
        options.vaultURL,
        options.credential,
        options.pipelineOptions
    );
    return KeyVault.of({
        use: (fn) => Effect.gen(function* () {
            const result = yield* Effect.tryPromise({
                try: () => fn(client),
                catch: (e) => new KeyVaultError({
                    cause: e,
                    message: "Asyncronous error in Keyvault.use",
                })
            });

            if (result instanceof Promise) {
                return yield* Effect.tryPromise({
                    try: () => result,
                    catch: (e) => new KeyVaultError({
                        cause: e,
                        message: "Asyncronous error in Keyvault.use"
                    })
                })
            } else {
                return result;
            }
        })
    });

});