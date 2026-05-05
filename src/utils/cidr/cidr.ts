import { Effect, Data, pipe, Schema as S } from "effect";
import { NetMaskError, type NetMaskImpl } from "./common";
import { IpSchema, IpOrCidrSchema } from "./schemas";

export class NetMask extends Data.Class<NetMaskImpl<"safe">> { }

const contains_internal = (
    targetAddr: string,
    srcIpNum: number,
    srcMaskNum: number,
) => pipe(
    S.decodeUnknownEffect(IpSchema)(targetAddr),
    Effect.mapError((e) => new NetMaskError({
        cause: e.issue,
        message: e.message,
    })),
    Effect.map((parts) => [parts[0], parts[2], parts[4], parts[6]] as const),
    Effect.map(([a, b, c, d]) => (a << 24) | (b << 16) | (c << 8) | d),
    Effect.map((targetIpNum) => (srcIpNum & srcMaskNum) >>> 0 === (targetIpNum & srcMaskNum) >>> 0)
);

export const make: (
    cidr: typeof IpOrCidrSchema.Encoded
) => Effect.Effect<NetMask, NetMaskError, never> = Effect.fn(function* (cidr) {
    const parts = yield* S.decodeUnknownEffect(IpOrCidrSchema)(cidr).pipe(
        Effect.mapError((e) => new NetMaskError({
            cause: e.issue,
            message: e.message
        }))
    );

    const [a, b, c, d, prefix] = [parts[0], parts[2], parts[4], parts[6], parts[8] ?? 0];
    const ipNum = (a << 24) | (b << 16) | (c << 8) | d;
    const maskNum = (0xFFFFFFFF << (32 - prefix)) & 0xFFFFFFFF;
    const networkNum = ipNum & maskNum;
    const broadcastNum = networkNum | (~maskNum & 0xFFFFFFFF);
    const hostmaskNum = ~maskNum & 0xFFFFFFFF;

    const numToIp = (n: number) => `${(n >> 24) & 255}.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
    const base = numToIp(networkNum);
    const mask = numToIp(maskNum);
    const bitmask = prefix;
    const hostmask = numToIp(hostmaskNum);
    const broadcast = numToIp(broadcastNum);
    const size = (1 << (32 - prefix));
    const first = numToIp(networkNum + 1);
    const last = numToIp(broadcastNum - 1);

    const contains = Effect.fn(function* (address: string) {
        return yield* contains_internal(address, ipNum, maskNum);
    });

    return new NetMask({
        base,
        mask,
        bitmask,
        hostmask,
        broadcast,
        size,
        first,
        last,
        contains,
    });
});