import { Data, Effect } from "effect";

export class NetMaskError extends Data.TaggedError("NetMaskError")<{
    message: string;
    cause?: unknown;
}> { }

export interface NetMaskImpl <T extends "safe" | "unsafe">{
    base: string;
    mask: string;
    bitmask: number;
    hostmask: string;
    broadcast: string;
    size: number;
    first: string;
    last: string;
    contains: (address: string) => T extends "safe" ? Effect.Effect<boolean, NetMaskError> : boolean;
}