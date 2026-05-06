import { Data, Effect } from "effect";
import type { IpOrCidrSchema } from "./schemas";

export class OctetError extends Data.TaggedError("OctetError")<{
    message: string;
    cause?: unknown;
}> { }

export interface OctetArgs {
    address: typeof IpOrCidrSchema.Encoded;
}

type OctetTag = "sync" | "effect";

export interface OctetImpl<T extends OctetTag> {
    base: string;
    mask: string;
    bitmask: number;
    hostmask: string;
    broadcast: string;
    size: number;
    first: string;
    last: string;
    contains: (address: string) => T extends "sync" ? boolean : Effect.Effect<boolean, OctetError>;
}