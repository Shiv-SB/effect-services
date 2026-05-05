import { Data, Effect, Schema as S } from "effect";

export class NetMaskError extends Data.TaggedError("NetMaskError")<{
    message: string;
    cause?: unknown;
}> { }

interface NetMaskImpl {
    base: string;
    mask: string;
    bitmask: string;
    hostmask: string;
    broadcast: string;
    size: string;
    first: string;
    last: string;
    contains: (address: string) => Effect.Effect<boolean, NetMaskError>;
    toString: () => string;
}

export class NetMask extends Data.Class<NetMaskImpl> { }

const OctectSchema = S.Int.pipe(S.check(
    S.isBetween({
        minimum: 0,
        maximum: 255,
        exclusiveMinimum: false,
        exclusiveMaximum: false,
    }))
).annotate({
    identifier: "Octect",
})

const MaskSchema = S.Int.pipe(S.check(
    S.isBetween({
        minimum: 0,
        maximum: 32,
        exclusiveMinimum: false,
        exclusiveMaximum: false,
    }))
).annotate({
    identifier: "Routing Prefix",
});

const IpSchema = S.TemplateLiteralParser([
    OctectSchema,
    ".",
    OctectSchema,
    ".",
    OctectSchema,
    ".",
    OctectSchema,
]).annotate({
    identifier: "IP Address",
});

const CidrSchema = S.TemplateLiteralParser([
    OctectSchema,
    ".",
    OctectSchema,
    ".",
    OctectSchema,
    ".",
    OctectSchema,
    "/",
    MaskSchema,
]);

const contains_internal = Effect.fn(function* (srcIpNum: number, srcMaskNum: number, targetAddr: string) {
    const parts = yield* S.decodeUnknownEffect(IpSchema)(targetAddr).pipe(
        Effect.mapError((e) => new NetMaskError({
            cause: e.issue,
            message: e.message,
        }))
    );

    const [a, b, c, d] = [parts[0], parts[2], parts[4], parts[6]];
    const targetIpNum = (a << 24) | (b << 16) | (c << 8) | d;

    return (srcIpNum & srcMaskNum) >>> 0 === (targetIpNum & srcMaskNum) >>> 0
});

export const make: (
    cidr: string
) => Effect.Effect<NetMask, NetMaskError, never> = Effect.fn(function* (cidr) {
    const parts = yield* S.decodeUnknownEffect(CidrSchema)(cidr).pipe(
        Effect.mapError((e) => new NetMaskError({
            cause: e.issue,
            message: e.message
        }))
    );

    const [a, b, c, d, prefix] = [parts[0], parts[2], parts[4], parts[6], parts[8]];
    const ipNum = (a << 24) | (b << 16) | (c << 8) | d;
    const maskNum = (0xFFFFFFFF << (32 - prefix)) & 0xFFFFFFFF;
    const networkNum = ipNum & maskNum;
    const broadcastNum = networkNum | (~maskNum & 0xFFFFFFFF);
    const hostmaskNum = ~maskNum & 0xFFFFFFFF;

    const numToIp = (n: number) => `${(n >> 24) & 255}.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
    const base = numToIp(networkNum);
    const mask = numToIp(maskNum);
    const bitmask = prefix.toString();
    const hostmask = numToIp(hostmaskNum);
    const broadcast = numToIp(broadcastNum);
    const size = (1 << (32 - prefix)).toString();
    const first = numToIp(networkNum + 1);
    const last = numToIp(broadcastNum - 1);

    const contains: NetMaskImpl["contains"] = Effect.fn(function* (address) {
        return yield* contains_internal(ipNum, maskNum, address);
    })

    const toString = () => `${base}/${bitmask}`;

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
        toString
    });
});

//----------

const testRange = "192.168.8.3/30";

Effect.gen(function* () {
    const netmask = yield* make(testRange);
    yield* Effect.log(netmask);

    const res = yield* netmask.contains("192.168.8.4");
    yield* Effect.log(res);
}).pipe(
    Effect.runPromise,
);

