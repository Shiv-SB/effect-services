import { Schema as S } from "effect";
import { NetMask, NetMaskImpl } from "./common";
import { IpOrCidrSchema, IpSchema } from "./schemas";

// TODO: fix type errors
class MakeUnsafe extends NetMask<"sync"> implements NetMaskImpl<"sync"> {
    private numToIp = (n: number) => `${(n >> 24) & 255}.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;

    private get parts() {
        const parts = S.decodeSync(IpOrCidrSchema)(this.address);
        return {
            a: parts[0],
            b: parts[2],
            c: parts[4],
            d: parts[6],
            prefix: parts[8] ?? 0
        }
    }

    private get ipNum() {
        const { a, b, c, d } = this.parts;
        return (a << 24) | (b << 16) | (c << 8) | d;
    }

    private get maskNum() {
        const { prefix } = this.parts;
        return (0xFFFFFFFF << (32 - prefix)) & 0xFFFFFFFF;
    }

    private get networkNum() {
        return this.ipNum & this.maskNum;
    }

    private get broadcastNum() {
        return this.networkNum | (~this.maskNum & 0xFFFFFFFF);
    }

    private get hostmaskNum() {
        return ~this.maskNum & 0xFFFFFFFF;
    }

    public readonly base = this.numToIp(this.networkNum);

    public readonly mask = this.numToIp(this.maskNum);

    public readonly bitmask = this.parts.prefix;

    public readonly hostmask = this.numToIp(this.hostmaskNum);

    public readonly broadcast = this.numToIp(this.broadcastNum);

    public readonly size = (1 << 32 - this.parts.prefix);

    public readonly first = this.numToIp(this.networkNum + 1);

    public readonly last = this.numToIp(this.broadcastNum - 1);

    public readonly contains = (targetAddr: string): boolean => {
        const parts = S.decodeUnknownSync(IpSchema)(targetAddr);
        const [a, b, c, d] = [parts[0], parts[2], parts[4], parts[6]];
        const targetIpNum = (a << 24) | (b << 16) | (c << 8) | d;
        return this.networkNum >>> 0 === (targetIpNum & this.maskNum) >>> 0
    }
}