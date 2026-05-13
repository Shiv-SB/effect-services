import { Data, Effect } from "effect";
import {
    contains_sync,
    getFirst,
    getLast,
    getPartsSync,
    getAddressCount,
    hostmaskNum,
    isPrivate,
    numToIp,
    partsToBroadcastNumber,
    cidrToUInt,
    prefixToUInt,
    type OctetArgs,
    type OctetImpl
} from "./common";
import type { Address } from "./schemas";

class _OctetSync extends Data.Class<OctetArgs> { };

export class OctetSync extends _OctetSync implements OctetImpl<"sync"> {
    #parts = getPartsSync(this.address);
    #networkNum = cidrToUInt(this.#parts);
    #maskNum = prefixToUInt(this.#parts.prefix);
    #broadcastNum = partsToBroadcastNumber(this.#parts);

    public readonly base = numToIp(this.#networkNum);
    public readonly mask = numToIp(this.#maskNum);
    public readonly bitmask = this.#parts.prefix;
    public readonly hostmask = numToIp(hostmaskNum(this.#maskNum));
    public readonly broadcast = numToIp(this.#broadcastNum);
    public readonly addressCount = getAddressCount(this.#parts.prefix);
    public readonly first = numToIp(getFirst(this.#parts.prefix, this.#networkNum));
    public readonly last = numToIp(getLast(this.#parts.prefix, this.#broadcastNum));
    public readonly version = "ipv4";

    public contains = (address: string): boolean => contains_sync(address as Address, this.#networkNum, this.#maskNum);

    public private = isPrivate(this.address);
}

/**
 * Creates a utility class for parsing IP addresses.
 * If the bitmask is ommited, it will default to 32.
 * 
 * The utility class will throw a `SchemaError` if the
 * recieved IP address is invalid.
 */
export const MakeSync = Effect.fnUntraced(function* (args: OctetArgs) {
    return new OctetSync(args);
});
