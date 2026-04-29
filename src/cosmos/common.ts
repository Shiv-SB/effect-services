import { Data } from "effect";

export class CosmosError extends Data.TaggedError("ComsosError")<{
    cause?: unknown;
    message: string;
    source: "CONTAINER_CLIENT_SDK" | "COSMOS_CLIENT_SDK" | "COSMOS_CLIENT";
}> { }