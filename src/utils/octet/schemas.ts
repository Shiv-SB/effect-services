import { Schema as S } from "effect";

/**
 * Strict IPv4 octet:
 *
 * 0
 * 1-9
 * 10-99
 * 100-199
 * 200-249
 * 250-255
 *
 * No leading zeros allowed.
 */
const IPV4_OCTET = "(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]\\d?|0)";

const IPV4_REGEX = new RegExp(`^(${IPV4_OCTET}\\.){3}${IPV4_OCTET}$`);

const CIDR_MASK = "(?:3[0-2]|[12]?\\d)";

const CIDR_REGEX = new RegExp(`^(${IPV4_OCTET}\\.){3}${IPV4_OCTET}\\/${CIDR_MASK}$`);

export const IpSchema = S.String.pipe(
    S.refine((s): s is IpAddress => IPV4_REGEX.test(s))
)

export const CidrSchema = S.String.pipe(
    S.refine((s): s is Cidr => CIDR_REGEX.test(s))
)

export const IpOrCidrSchema = S.Union([
    IpSchema,
    CidrSchema,
]);

export type IpAddress = `${number}.${number}.${number}.${number}`;
export type Cidr = `${IpAddress}/${number}`;
export type Address = typeof IpOrCidrSchema.Type;
