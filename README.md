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

## Whats included?

This package has modules for the following services:
- Companies House
- Azure Cosmos NoSQL
- FreshService
- iManage
- Azure Key Vault
- Legl
- Microsoft Graph
- MSSQL

As well as the above there is also a utilities module containing various helpful Effect functions.

## Examples

All public API's will have JsDoc examples. See the relevant functions for proper example usage.

Important! There is no single entrypoint for this repo! When importing, I would recommend using namespace imports, i.e `import * as Legl from "effect-services/legl"`.

### Microsoft Graph

The below is an example of how to use the MsGraph module. (Effect imports have been ommited for beravity)
```typescript
import * as Graph from "effect-services/msgraph";

const Example = Effect.gen(funciton* () {
    const graph = yield* Graph.MsGraph;

    const request: GraphRequest = yield* graph.use(
        (c) => c.api("/users").select(["id", "displayName"])
    );

    // Stream.Stream<unknown, Graph.MsGraphError, never>
    const stream = yield* Graph.makeStream(request);

    yield* Stream.runForEach(stream, Effect.log);
});

const LayerLive = Graph.Layer({
    tenantID: "abc",
    clientID: "abc",
    clientSecret: "abc",
    scopes: ["https://graph.microsoft.com/.default"]
});

Example.pipe(
    Effect.provide(LayerLive),
    Effect.runPromise
);
```

## Requirements

Effect is **not** bundled as a requirement for the entirity of this repository, instead it is a peerDependency.

All the modules have been written with Effect V3 as the target. I may release a version targeting Effect V4 in the future, but I will be waiting for a stable V4 release first.

Although I have written all the modules with Bun as the runtime in mind, only the iManage and Utils folder require a Bun runtime.

## Development

Bun is required for development. As usual, pull the repo and install deps with `bun i`.

To build to JS, run: `bun run build`. This will transpile the .ts files, generate .d.ts files, and validate the export structure in package.json.


## Contribution