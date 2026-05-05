import { Data, Effect, pipe, Schema as S } from "effect";

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
})

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
]).annotate({
    identifier: "CIDR"
});

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

const IpOrCidrSchema = S.Union([IpSchema, CidrSchema]);

type AddressOrCIDR = typeof IpOrCidrSchema.Encoded;

class NetMask2 extends Data.Class<{ address: AddressOrCIDR }> {
    private numToIp = (n: number) => `${(n >> 24) & 255}.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;

    private parts = Effect.fnUntraced(function* (addr: string) {
        const parts = yield* S.decodeUnknownEffect(IpOrCidrSchema)(addr).pipe(
            Effect.mapError((e) => new NetMaskError({
                cause: e.issue,
                message: e.message
            }))
        );
        return {
            a: parts[0],
            b: parts[2],
            c: parts[4],
            d: parts[6],
            prefix: parts[8] ?? 0
        };
    });

    private ipNum = this.parts(this.address).pipe(
        Effect.map(({ a, b, c, d }) => (a << 24) | (b << 16) | (c << 8) | d)
    );

    private maskNum = this.parts(this.address).pipe(
        Effect.map(({ prefix }) => (0xFFFFFFFF << (32 - prefix)) & 0xFFFFFFFF)
    );

    private networkNum = Effect.all([this.ipNum, this.maskNum]).pipe(
        Effect.map(([a, b]) => a & b)
    );

    private broadcastNum = Effect.all([this.networkNum, this.maskNum]).pipe(
        Effect.map(([n, m]) => n | (~m & 0xFFFFFFFF))
    );

    private hostmaskNum = this.maskNum.pipe(
        Effect.map((n) => ~n & 0xFFFFFFFF)
    );

    private contains_internal = (
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

    public base = this.networkNum.pipe(Effect.map(this.numToIp));
    public mask = this.maskNum.pipe(Effect.map(this.numToIp));
    public bitmask = this.parts(this.address).pipe(Effect.map((p) => p.prefix.toString(10)));
    public hostmask = this.hostmaskNum.pipe(Effect.map(this.numToIp));
    public broadcast = this.broadcastNum.pipe(Effect.map(this.numToIp));
    public size = this.parts(this.address).pipe(
        Effect.map(({ prefix }) => (1 << 32 - prefix).toString())
    );
    public first = this.networkNum.pipe(Effect.map((n) => this.numToIp(n + 1)));
    public last = this.broadcastNum.pipe(Effect.map((n) => this.numToIp(n - 1)));
    public contains = (address: typeof IpSchema.Encoded) => Effect.all([this.ipNum, this.maskNum]).pipe(
        Effect.andThen(([ip, mask]) => this.contains_internal(address, ip, mask))
    );
}

//----------


Effect.gen(function* () {
    const testRange = "192.168.8.3/30";

    //netmask v1
    {
        const netmask = yield* make(testRange);
        const targetTest = "192.168.5.9";
        const doesContain = yield* netmask.contains(targetTest);
        yield* Effect.log("result:", doesContain);
        const mask = netmask.hostmask;
        yield* Effect.log(mask);
    }


    // netmask v2
    {
        const netmask = new NetMask2({ address: testRange });
        const targetTest = "192.168.5.9";
        const doesContain = yield* netmask.contains(targetTest);
        yield* Effect.log("result:", doesContain);
        const mask = yield* netmask.hostmask;
        yield* Effect.log(mask);
    }
}).pipe(
    Effect.runPromise,
);

