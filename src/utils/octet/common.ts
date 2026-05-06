import { Data, Effect, pipe, Schema as S } from "effect";
import { IpOrCidrSchema } from "./schemas";

//#region Types & Classes

export class OctetError extends Data.TaggedError("OctetError")<{
    message: string;
    cause?: unknown;
}> { }

export type Address = typeof IpOrCidrSchema.Encoded;

export interface OctetArgs {
    address: Address;
}

type OctetTag = "sync" | "effect";

export interface OctetImpl<T extends OctetTag> {
    version: "ipv4" | "ipv6";
    base: string;
    mask: string;
    bitmask: number;
    hostmask: string;
    broadcast: string;
    size: number;
    first: string;
    last: string;
    contains: (address: string) => T extends "sync" ? boolean : Effect.Effect<boolean, OctetError>;
    private: boolean; // https://www.rfcreader.com/#rfc1918_line141
}

type Parts = {
    a: number;
    b: number;
    c: number;
    d: number;
    prefix: number;
}

//#region Functions

export const isPrivate = (addr: Address): boolean => {
    const parts = addr.split(".")
    const [a, b] = [parts[0], parts[2]].map(Number);

    return (
        a === 10 ||                             // 10.*
        (a === 172 && b! >= 16 && b! <= 31) ||  // 172.{16 - 31}.*
        (a === 192 && b === 168)                // 192.168.*
    );
};

export const numToIp = (n: number) => `${(n >> 24) & 255}.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;

export const getPartsSync = (addr: Address): Parts => {
    const parts = S.decodeSync(IpOrCidrSchema)(addr);
    return {
        a: parts[0],
        b: parts[2],
        c: parts[4],
        d: parts[6],
        prefix: parts[8] ?? 32
    };
}

export const getParts = Effect.fn(function* (addr: Address) {
    const parts = yield* S.decodeUnknownEffect(IpOrCidrSchema)(addr).pipe(
        Effect.mapError((e) => new OctetError({
            cause: e.issue,
            message: e.message
        }))
    );
    return {
        a: parts[0],
        b: parts[2],
        c: parts[4],
        d: parts[6],
        prefix: parts[8] ?? 32
    };
});

const partsToIpNum = (parts: Parts): number => {
    const { a, b, c, d } = parts;
    return (
        (a * 2 ** 24) +
        (b * 2 ** 16) +
        (c * 2 ** 8) +
        d
    ) >>> 0;
};

export const prefixToMaskNum = (prefix: number): number => {
    if (prefix === 0) return 0;
    return (0xFFFFFFFF << (32 - prefix)) >>> 0;
};

export const partsToNetworkNum = (parts: Parts): number => partsToIpNum(parts) & prefixToMaskNum(parts.prefix);

export const partsToBroadcastNumber = (
    parts: Parts
): number => partsToNetworkNum(parts) | (~prefixToMaskNum(parts.prefix) & 0xFFFFFFFF);

export const hostmaskNum = (maskNum: number): number => ~maskNum & 0xFFFFFFFF;

export const getSize = (prefix: number): number => 2 ** (32 - prefix);

export const getFirst = (prefix: number, base: number): number => prefix >= 31 ? base : base + 1;

export const getLast = (prefix: number, broadcast: number): number => prefix >= 31 ? broadcast : broadcast - 1;
export const contains_effect = (
    targetAddr: Address,
    srcIpNum: number,
    srcMaskNum: number,
) => pipe(
    getParts(targetAddr),
    Effect.map((parts) => partsToIpNum(parts)),
    Effect.map((targetIpNum) => (srcIpNum & srcMaskNum) >>> 0 === (targetIpNum & srcMaskNum) >>> 0)
);

export const contains_sync = (
    targetAddr: Address,
    srcIpNum: number,
    srcMaskNum: number,
) => {
    const parts = getPartsSync(targetAddr);
    const targetIpNum = partsToIpNum(parts);
    return (srcIpNum & srcMaskNum) >>> 0 === (targetIpNum & srcMaskNum) >>> 0;
}
