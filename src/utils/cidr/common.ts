import { Data, Effect } from "effect";
import type { IpOrCidrSchema } from "./schemas";

export class NetMaskError extends Data.TaggedError("NetMaskError")<{
    message: string;
    cause?: unknown;
}> { }

type ImplTag = "sync" | "effect";

export interface NetMaskImpl <T extends ImplTag>{
    base: string;
    mask: string;
    bitmask: number;
    hostmask: string;
    broadcast: string;
    size: number;
    first: string;
    last: string;
    contains: (address: string) => T extends "effect" ? Effect.Effect<boolean, NetMaskError> : boolean;
}

export interface NetMaskArgs {
    address: typeof IpOrCidrSchema.Encoded;
}