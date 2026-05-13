# Effect-Services

<p align="left">
  <a href="https://www.npmjs.com/package/effect-services">
    <img src="https://img.shields.io/npm/v/effect-services?color=blue" alt="npm version" />
  </a>
  <a href="https://www.npmjs.com/package/effect-services">
    <img src="https://img.shields.io/npm/dm/effect-services.svg?color=brightgreen" alt="npm downloads" />
  </a>
  <a href="https://bundlephobia.com/package/effect-services">
    <img src="https://img.shields.io/bundlephobia/minzip/effect-services?label=unpacked%20size" alt="npm bundle size" />
  </a>
  <a href="https://github.com/Shiv-SB/effect-services/actions/workflows/npm-publish.yml">
    <img src="https://github.com/Shiv-SB/effect-services/actions/workflows/npm-publish.yml/badge.svg" alt="Publish to NPM" />
  </a>
</p>

## Overview

A collection of various Effectful services to communicate with 3rd party services, as well as utilities.

The modules included are used for my specific use-cases and so may be opionated, but I have attempted to make them as generic as possible nevertheless.

## Installation

```bash
bun add effect-services effect
# or
npm install effect-services effect
# or
yarn add effect-services effect
```

**Note:** `effect` is a peer dependency and must be installed separately. Check the Peer Dependencies in `package.json` to see which effect version is supported.

## Modules

### Azure Cosmos NoSQL
Effectful wrapper for Azure Cosmos DB NoSQL operations. Provides a type-safe interface for database and container operations with streaming support.

```typescript
import * as Cosmos from "effect-services/cosmos";
```

**Features:**
- Effectful container SDK wrapper for CRUD operations
- Custom client implementation including rate limiting handling
- Query to Effect Stream support
---

### Companies House
Integration with the UK Companies House API for business information retrieval.

```typescript
import * as CompaniesHouse from "effect-services/companieshouse";
```

**Features:**
- Response types provided from underlying Companies House SDK.
- Rate limit handling in CompaniesHouse
---

### FreshService
Integration with Freshservice ticketing and IT service management platform.

```typescript
import * as FreshService from "effect-services/freshservice";
```

**Features:**
- Authentication handling
- Rate limit handling
- Automatic API pagination via Effect Stream
---

### iManage
Integration with iManage document and content management system.

```typescript
import * as iManage from "effect-services/imanage";
```

**Features:**
- Automatic OAuth2 token refreshing
- File upload helper function
---

### Azure Key Vault
Secure secrets management using Azure Key Vault.

```typescript
import * as KeyVault from "effect-services/keyvault";
```

**Features:**
- Secrets retrieval with optional caching
- No bootstrap secrets required
- Can be used as an Effect ConfigProvider
---

### Legl
Integration with Legl automation platform.

```typescript
import * as Legl from "effect-services/legl";
```

**Features:**
- Automatic API pagination via Effect Stream
- Comprehensive Legl API Schemas
---

### Microsoft Graph
Comprehensive wrapper for Microsoft Graph API with streaming capabilities.

```typescript
import * as Graph from "effect-services/msgraph";
```

**Features:**
- Effectful wrapper for query construction
- Support for Graph Query to Effect Stream
---

### MSSQL
Effectful MSSQL database client with query pooling and streaming.

```typescript
import * as MSSQL from "effect-services/mssql";
```

**Features:**
- Effectful connection pooling
- SQL query to Effect Stream support
- Effectful wrapper for the `mssql` SDK
---

### Utils
Utility functions and helpers for Effect-based applications.

```typescript
import * as Utils from "effect-services/utils";
```

**Features:**
- Task scheduling for development environments via Crons and CLI
- IP Address and CIDR parsing
- Dynamic bloom filters
---

### Azure File Share
Integration with Azure Storage File Shares.

```typescript
import * as AzureFS from "effect-services/azurefs";
```

**Features:**
- File and directory operations
- Directory items to Effect Stream helper

## Import Guide

**Important!** There is no single entrypoint for this repo. When importing, use namespace imports:

```typescript
import * as Legl from "effect-services/legl";
import * as Graph from "effect-services/msgraph";
import * as MSSQL from "effect-services/mssql";
```

Not:
```typescript
import Legl from "effect-services"; // ❌ This won't work
```

## Examples

All public APIs include JsDoc examples (WIP). Refer to the relevant function documentation for detailed usage patterns.

### Microsoft Graph Example

Interact with Microsoft 365 services including users, mail, and OneDrive:

```typescript
import * as Graph from "effect-services/msgraph";
import { Effect, Stream } from "effect";

const ExampleListUsers = Effect.gen(function* () {
    const graph = yield* Graph.MsGraph;

    const request = yield* graph.use(
        (c) => c.api("/users")
            .select(["id", "displayName", "mail"])
            .top(10)
    );

    const stream = yield* Graph.MakeStream(request);

    yield* Stream.runForEach(stream, (user) => 
        Effect.log(`User: ${user.displayName} (${user.mail})`)
    );
});

const LayerLive = Graph.layer({
    tenantID: "your-tenant-id",
    clientID: "your-client-id",
    clientSecret: "your-client-secret",
    scopes: ["https://graph.microsoft.com/.default"]
});

ExampleListUsers.pipe(
    Effect.provide(LayerLive),
    Effect.runPromise
);
```

### MSSQL Example

Execute queries and handle streaming results with transaction support:

```typescript
import * as MSSQL from "effect-services/mssql";
import { Effect, Stream } from "effect";

const QueryExample = Effect.gen(function* () {
    const sql = yield* MSSQL.MsSqlClient;
    
    // Access the connection pool
    const pool = yield* sql.MakePool;

    const queryString = "SELECT * FROM Users WHERE Active = 1";

    // Simple query
    const result = yield* Effect.tryPromise(() => pool.query(queryString));

    yield* Effect.log("result:", result.output);

    // Streaming for large datasets
    const stream = yield* sql.MakeStream(queryString);
    yield* Stream.runForEach(stream, (r) => Effect.log("record:", r));
});

const LayerLive = MSSQL.MsSqlClient.layer({
    server: "your-server.database.windows.net",
    database: "your-database",
    user: "username",
    password: "password",
    // ...
});

QueryExample.pipe(
    Effect.provide(LayerLive),
    Effect.runPromise
);
```

### Azure Cosmos DB Example

Work with document collections using the Cosmos SDK:

```typescript
import * as Cosmos from "effect-services/cosmos";
import { Effect, Stream } from "effect";

const CosmosExample = Effect.gen(function* () {
    const cosmos = yield* Cosmos.CosmosClient;

    const container = yield* cosmos.container("Users");

    // Container operations
    const updateUser = yield* container.upsert({
        id: "123",
        status: "inactive",
    });

    yield* Effect.log("new status:", updateUser.resource?.status);

    {
        // Stream all items in container
        const stream = yield* container.allItems;
        yield* Stream.runForEach(stream, (r) => Effect.log("record ID:", r.id));
    }

    {
        // Stream items from query
        const stream = yield* container.queryToStream({
            query: "SELECT * FROM c WHERE c.status = @status",
            parameters: [{ name: "@status", value: "active" }]
        });

        yield* Stream.runForEach(stream, (u) => Effect.log("user:", u));
    }

    // Access underlying clients
    const url = yield* Effect.tryPromise(() => cosmos.client.getReadEndpoint());
    const response = yield* Effect.tryPromise(() => cosmos.database.read());
});

const LayerLive = Cosmos.CosmosClient.layer({
    connectionString: "https://your-account.documents.azure.com:443/",
    databaseID: "your-database-name"
});

CosmosExample.pipe(
    Effect.provide(LayerLive),
    Effect.runPromise
);
```

### Azure Key Vault Example

Securely retrieve and manage secrets:

```typescript
import * as KeyVault from "effect-services/keyvault";
import { Effect, Layer } from "effect";
import { DefaultAzureCredential } from "@azure/identity";

const SecretExample = Effect.gen(function* () {
    const vault = yield* KeyVault.KeyVault;

    // Retrieve a secret
    const dbPassword = yield* vault.getSecret("database-password");

    // Retrieve with cache
    const cachedVault = yield* KeyVault.KeyVaultAsCache;
    const apiKey = yield* cachedVault.lookup("api-key");

    // Use in application
    const connectionString = `Server=myserver;Password=${dbPassword};`;

    yield* Effect.log(`Connected with key version: ${apiKey.version}`);
});

const KeyVaultLayer = KeyVault.KeyVault.layer({
    vaultURL: "https://your-vault.vault.azure.us/",
    credential: new DefaultAzureCredential()
});

const CacheLayer = KeyVault.KeyVaultAsCache.layer({
    capacity: 10,
    timeToLive: "1 hour",
});

const LiveLayer = Layer.merge(KeyVaultLayer, CacheLayer);

SecretExample.pipe(
    Effect.provide(LiveLayer),
    Effect.runPromise
);
```

### Companies House Example

Retrieve UK business information:

```typescript
import * as CompaniesHouse from "effect-services/companieshouse";
import { Effect } from "effect";

const CompanyLookup = Effect.gen(function* () {
    const client = yield* CompaniesHouse.CompaniesHouse;

    const profile = yield* client.use((c) => c.companyProfile.getCompanyProfile("07424016")).pipe(
        Effect.map((r) => r.resource)
    );

    yield* Effect.log(profile?.companyName);
    yield* Effect.log(profile?.accounts.nextAccounts);
});

const LayerLive = CompaniesHouse.CompaniesHouse.layer({
    apiKey: "your-api-key"
});

CompanyLookup.pipe(
    Effect.provide(LayerLive),
    Effect.runPromise
);
```

## Requirements

- Bun, Node.js or equivelent runtimes.
- For versions **^2.0.0**: **Effect ^3.0.0** (installed separately as peer dependency)
- For versions **^3.0.0**: **Effect ^4.0.0** (installed separately as peer dependency)
- All other module requirements are bundled as dependencies (e.g. `@azure/identity`)

## Best Practices

### Error Handling

All modules which use custom implementations of services will have Effectful, tagged errors:

```typescript

import { Effect } from "effect";
import * as MsGraph from "effect-services/msgraph";

const Main = Effect.gen(function* () {
    const graph = yield* MsGraph.MsGraph;

    // Effect<GraphRequest, MsGraph.MsGraphError>
    const query = graph.use((c) => c.api("/invalid/path"));
});

```

### Streaming Large Datasets

Use streaming for memory-efficient processing of large result sets:

```typescript
import * as Graph from "effect-services/msgraph";
import { Stream, Effect } from "effect";

// Good: Memory-efficient streaming
const StreamUsers = Effect.gen(function* () {
    const graph = yield* Graph.MsGraph;
    const request = yield* graph.use((c) => c.api("/users"));
    const stream = yield* Graph.MakeStream(request);
    
    yield* Stream.runForEach(stream, (user) => Effect.log(user));
});
```

## Development

### Setup

Bun is required for development:

```bash
# Clone and install dependencies
git clone https://github.com/Shiv-SB/effect-services
cd effect-services
bun i
```

### Building

```bash
# Build TypeScript and generate type definitions
bun run build

# This will:
# - Transpile .ts to .js
# - Generate .d.ts type files
# - Validate exports in package.json
```

### Workspace Structure

```
src/                 # Source TypeScript files
├── cosmos/          # Azure Cosmos DB module
├── msgraph/         # Microsoft Graph module
├── mssql/           # MSSQL database module
├── keyvault/        # Azure Key Vault module
└── ...              # Other service modules

build/               # Compiled JavaScript and type definitions
lib/                 # Build utilities and helpers
tests/               # Unit and integration tests
```

### Development Tips

- Try to keep each module independent. Any shared functions should be stored in `internals`.
- The package exports are validated on build to ensure correctness

## Common Patterns

### Dependency Injection

All modules use Effect's dependency injection for configuration:

```typescript
import * as MSSQL from "effect-services/mssql";
import { Effect } from "effect";

const MyApp = Effect.gen(function* () {
    const client = yield* MSSQL.MsSqlClient;
    // Use client
});

const layer = MSSQL.MsSqlClient.layer({ /* config */ });

MyApp.pipe(Effect.provide(layer), Effect.runPromise);
```

### Combining Multiple Services

This example showcase using three different services concurrently, mssql, msgraoh and keyvault.
msgraph and mssql are used to generate Streams, and keyvault is used as the ConfigProvider.


```typescript
import { DefaultAzureCredential } from "@azure/identity";
import { Config, ConfigProvider, Effect, Layer, Stream } from "effect";
import { MakeKeyVaultProvider } from "effect-services/keyvault";
import * as MsGraph from "effect-services/msgraph";
import * as SQL from "effect-services/mssql";

const GetGraphUsers = Effect.gen(function* () {
    const graph = yield* MsGraph.MsGraph;

    // .use method to access the api builder
    const query = yield* graph.use(
        (c) => c.api("/users").select(["id", "displayName", "officeLocation"])
    );

    // Pass the query to the Stream factory
    const stream = yield* MsGraph.MakeStream(query);
    return stream;
});

const GetSqlUsers = Effect.gen(function* () {
    const sql = yield* SQL.MsSqlClient;

    const stream = yield* sql.MakeStream("SELECT * FROM Users");
    return stream;
});

const ExampleApp = Effect.all([GetGraphUsers, GetSqlUsers]).pipe(
    Effect.map(([s1, s2]) => Stream.merge(s1, s2)),
    Effect.tap(Effect.log("Starting...")),
    Effect.andThen(Stream.runForEach((user) => Effect.log("user:", user))),
    Effect.tap(Effect.log("Finished!")),
)

// Create a ConfigProvider backed by Azure Key Vault
// No secrets needed! Authentication happens via the credential,
// so your codebase can be completely free of secrets and keys.
const SecretsProvider = MakeKeyVaultProvider({
    vaultURL: "https://my-vault.vault.azure.us/",
    credential: new DefaultAzureCredential()
});

// Provide a fallback to process.env
const MergedProvider = SercretsProvider.pipe(
    ConfigProvider.orElse(ConfigProvider.fromEnv)
);

// Convert the provider into a layer.
const providerLayer = ConfigProvider.layer(MergedProvider);

// A simple provider function which constructs and then provides our layers.
// We use an Effectful function for this because we need to yield* Config values.
const ProvideLayers = <A, E, R>(
    runnable: Effect.Effect<A, E, R>
) => Effect.gen(function* () {
    // Construct each layer...

    const graphLayer = MsGraph.MsGraph.layer({
        clientID: yield* Config.string("example-secret-clientID"),
        clientSecret: yield* Config.string("example-secret-clientSecret"),
        tenantID: yield* Config.string("example-secret-tenantID"),
        scopes: ["https://graph.microsoft.com/.default"]
    });

    const sqlLayer = SQL.MsSqlClient.layer({
        server: yield* Config.string("example-secret-server"),
        password: yield* Config.string("example-secret-password"),
        port: yield* Config.port("server-port").pipe(Config.withDefault(1433))
    });

    // Combine all your layers!
    const allLayers = Layer.mergeAll(graphLayer, sqlLayer);

    return yield* runnable.pipe(
        Effect.provide(allLayers)
    );
}).pipe(
    Effect.provide(providerLayer)
);

ExampleApp.pipe(
    ProvideLayers,
    Effect.runPromise,
);


```

## Contributing

Contributions are welcome! Please:

1. **Fork the repository** and create a feature branch
2. **Follow the existing patterns** - Each module should follow the same structure and conventions
3. **Write tests** for new functionality
4. **Build and validate** with `bun run build` & `bun audit` before submitting
5. **Keep Effect v4 compatibility** unless there's a major version bump

### Module Development Guidelines

- Use Effect for all async operations.
- Do not create any side-effects.
- Provide JSDoc comments with usage examples
- Include type definitions (even when verbose to do so)
- Create corresponding tests
- Update the README with module description

## License

See [LICENSE](LICENSE) file for details.

## Support

For issues, questions, or feature requests, please open an issue on GitHub at [Shiv-SB/effect-services](https://github.com/Shiv-SB/effect-services)