import { Data, Effect } from "effect";
import { 
    OctetError, 
    type OctetImpl, 
    type OctetArgs, 
    isPrivate, 
    getParts, 
    cidrToUInt, 
    prefixToUInt, 
    partsToBroadcastNumber, 
    numToIp, 
    hostmaskNum, 
    getAddressCount, 
    getFirst, 
    getLast, 
    contains_effect, 
} from "./common";
import type { Address } from "./schemas";

class OctetEffect extends Data.Class<OctetImpl<"effect"> & OctetArgs> { };

/**
 * Creates an Effectful utility class for parsing IP addresses.
 * If the bitmask is ommited, it will default to 32.
 * 
 * @example
 * 
 * import * as Utils from "effect-services/utils";
 * 
 * const Example = Effect.gen(function* () {
 *  const octet = yield* Utils.Octet.MakeEffect({ address: "192.168.0.1/32" });
 *  const size = octect.size;
 *  yield* Effect.log(size);
 * 
 *  const result = yield* octet.contains("192.168.0.100");
 *  yield* Effect.log(result);
 * });
 */
export const MakeEffect: (
    args: OctetArgs
) => Effect.Effect<OctetEffect, OctetError, never> = Effect.fn(function* (args) {
    const parts = yield* getParts(args.address);
    const networkNum = cidrToUInt(parts);
    const maskNum = prefixToUInt(parts.prefix);
    const broadcastNum = partsToBroadcastNumber(parts);

    return new OctetEffect({
        address: args.address,
        version: "ipv4",
        private: isPrivate(args.address),
        base: numToIp(networkNum),
        mask: numToIp(maskNum),
        bitmask: parts.prefix,
        hostmask: numToIp(hostmaskNum(maskNum)),
        broadcast: numToIp(broadcastNum),
        addressCount: getAddressCount(parts.prefix),
        first: numToIp(getFirst(parts.prefix, networkNum)),
        last: numToIp(getLast(parts.prefix, broadcastNum)),
        contains: (address: string) => contains_effect(address as Address, networkNum, maskNum)
    });
});