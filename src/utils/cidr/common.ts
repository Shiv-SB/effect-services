import { Data, Effect } from "effect";
import type { IpOrCidrSchema } from "./schemas";

export class NetMaskError extends Data.TaggedError("NetMaskError")<{
    message: string;
    cause?: unknown;
}> { }

export interface NetMaskArgs {
    address: typeof IpOrCidrSchema.Encoded;
}

type NetMaskTag = "sync" | "effect";

export interface NetMaskImpl<T extends NetMaskTag> {
    base: string;
    mask: string;
    bitmask: number;
    hostmask: string;
    broadcast: string;
    size: number;
    first: string;
    last: string;
    contains: (address: string) => T extends "sync" ? boolean : Effect.Effect<boolean, NetMaskError>;
}