import { Schema as S } from "effect";

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

export const IpSchema = S.TemplateLiteralParser([
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

export const CidrSchema = S.TemplateLiteralParser([
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

export const IpOrCidrSchema = S.Union([IpSchema, CidrSchema]);
