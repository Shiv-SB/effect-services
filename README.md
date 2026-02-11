# effect-azure-kv

Key Vault Service for Effect

This library is a lightweight Effect wrapper for the Azure Secrets Key Vault.

## Quickstart

```ts
import { Effect, Layer, Logger, pipe } from "effect";
import * as KeyVault from "effect-azure-kv";

// Example with standard KeyVault service
const Example = Effect.gen(function* () {
    const kv = yield* KeyVault.KeyVault;
    
    // Access the SecretClient in the callback.
    // All responses are typesafe and Effectful!
    const vaultURL = yield* kv.use((client) => client.vaultUrl);
    yield* Effect.log("Vault URL:", vaultURL);

    const mySecret = yield* kv.use((client) => client.getSecret("my-key"))

    yield* Effect.log(mySecret.value);
});

const CacheExample = Effect.gen(function* () {
    // KeyVault is wrapped in an Effect Cache
    // Cache settings are provided at the Layer level
    const kv = yield* KeyVault.KeyVaultAsCache;

    const getSecret = kv.get("my-key");

    yield* Effect.repeatN(getSecret, 10);

    const mySecret = yield* getSecret;    
    const cacheStats = yield* kv.cacheStats;

    yield* Effect.log(`Secret: ${mySecret.value}.`, cacheStats);
});

const Program = Effect.all([Example, CacheExample]).pipe(
    // KeyVault will only throw tagged errors.
    // The .cause property is the response error JSON object provided by the Azure SDK.
    Effect.catchTag("KeyVaultError", (e) => Effect.logError(e.message, e.cause))
);

const AppLayerLive = Layer.mergeAll(
    Logger.pretty,
    KeyVault.fromEnv,
    KeyVault.KeyVaultAsCache.Default({ capacity: 64, timeToLive: 3600 }),
);

pipe(
    Program,
    Effect.provide(AppLayerLive),
    Effect.runPromise,
);
```

## Environment
- `KV_URL` - (required) full vault URL, for example: `https://my-kv.vault.azure.net/`.

**Notes**
- The library uses `@azure/identity`'s `DefaultAzureCredential` when using
	`fromEnv`, so make sure authentication is configured for the environment
	where the code runs (managed identity, environment vars, or Azure CLI).
- Errors from Key Vault operations are wrapped in `KeyVaultError` for
	structured effect-based error handling.

## Development

```shell
# Install deps
bun i

# Build (outputs to ./build)
bun run build

# Generate .d.ts files (outputs to ./build)
bun generate:types
```