import { Effect, Layer, Logger, pipe } from "effect";
import * as KeyVault from "./index";

const Example = Effect.gen(function* () {
    const kv = yield* KeyVault.KeyVault;
    const vaultURL = yield* kv.use((client) => client.vaultUrl);
    yield* Effect.log("Vault URL:", vaultURL);

    const mySecret = yield* kv.use((client) => client.getSecret("my-key"))

    yield* Effect.log(mySecret.value);
});

const CacheExample = Effect.gen(function* () {
    const kv = yield* KeyVault.KeyVaultAsCache;

    const getSecret = kv.get("my-key");

    yield* Effect.repeatN(getSecret, 10);

    const mySecret = yield* getSecret;    
    const cacheStats = yield* kv.cacheStats;

    yield* Effect.log(`Secret: ${mySecret.value}.`, cacheStats);
});

const Program = Effect.all([Example, CacheExample]).pipe(
    Effect.catchTag("KeyVaultError", (e) => Effect.logError(e.message, e.cause))
);

const AppLayerLive = Layer.mergeAll(
    Logger.pretty,
    KeyVault.fromEnv,
    KeyVault.KeyVaultAsCache.Default({ capacity: 64, timeToLive: 3600 })
);

pipe(
    Program,
    Effect.provide(AppLayerLive),
    Effect.runPromise,
)