import * as B from "bun:test";
import { Schema } from 'effect';
import { CidrSchema, IpAddress, IpSchema } from '../../../src/utils/octet/schemas';

B.describe("IpSchema", () => {
    const passCases = [
        // Standard private
        "192.168.0.1",
        "10.10.10.10",
        "172.16.0.1",
        "172.31.255.255",

        // Public
        "1.1.1.1",
        "8.8.8.8",
        "99.99.99.99",

        // Boundary values
        "0.0.0.0",
        "255.255.255.255",
        "255.0.0.0",
        "0.255.0.255",

        // Loopback / link-local
        "127.0.0.1",
        "169.254.0.0",
        "169.254.255.255",

        // Multicast / reserved
        "224.0.0.1",
        "239.255.255.255",
        "240.0.0.1",
    ] as IpAddress[];

    const failCases = [
        // Too few / too many octets
        "192.168.0",
        "0.0.0",
        "1.0.0.0.1",
        "0.0.0.0.0",

        // Empty octets
        "192..0.1",
        ".0.0.0",
        "1.1.1.",
        ".1.1.1",
        "....",

        // Out of range
        "256.0.0.1",
        "192.300.0.1",
        "999.999.999.999",
        "1.0.0.1000",

        // Leading zeros
        "01.0.0.0",
        "001.0.0.0",
        "1.01.0.0",
        "1.1.001.1",
        "00.0.0.0",

        // Non-numeric
        "foo.0.0.0",
        "1.foo.1.1",
        "abc.def.ghi.jkl",

        // Scientific notation
        "1e1.0.0.1",
        "1.1e1.0.1",

        // Negative
        "-1.0.0.0",
        "1.-1.0.0",

        // Whitespace
        " 1.1.1.1",
        "1.1.1.1 ",
        "1. 1.1.1",
        "1.1.1 .1",
        " . . . ",

        // CIDR accidentally passed
        "1.1.1.1/24",

        // Garbage
        "",
        " ",
        "localhost",
        "null",
        "undefined",
    ] as unknown as IpAddress[];

    const decode = Schema.decodeResult(IpSchema);

    B.test.each(passCases)("should expect %p to pass validation", (a) => {
        const decoded = decode(a);
        B.expect(decoded._tag).toBe("Success");
    });

    B.test.each(failCases)("should expect %p to fail validation", (a) => {
        const decoded = decode(a);
        B.expect(decoded._tag).toBe("Failure");
    });
});

B.describe("CidrSchema", () => {
    const passCases = [
        // Standard private
        "192.168.0.1/32",
        "10.0.1.1/24",
        "172.16.0.1/12",

        // Boundary masks
        "0.0.0.0/0",
        "255.255.255.255/32",
        "1.1.1.1/1",
        "1.1.1.1/31",

        // Public
        "8.8.8.8/32",
        "1.1.1.1/24",

        // Multicast / reserved
        "224.0.0.1/4",
        "240.0.0.1/4",
    ] as typeof CidrSchema.Type[];

    const failCases = [
        // Missing mask
        "192.168.0.1",
        "1.0.0.1",
        "0.0.0.0",

        // Too many octets
        "1.1.1.1.1/32",
        ".0.0.0.1/24",

        // Invalid masks
        "1.1.1.1/33",
        "1.1.1.1/255",
        "1.1.1.1/-1",
        "1.1.1.1/",
        "1.1.1.1//24",

        // Invalid IPs
        "999.999.999.999/24",
        "256.0.0.1/24",
        "1.1.1/24",
        "1..1.1/24",

        // Leading zeros
        "01.01.01.01/24",
        "1.1.01.1/24",
        "001.1.1.1/24",

        // Scientific notation
        "1e1.1.1.1/24",
        "1.1.1.1/1e1",

        // Negative
        "-1.0.0.0/24",
        "1.1.1.1/-24",

        // Whitespace
        " 1.1.1.1/24",
        "1.1.1.1/24 ",
        "1.1.1 .1/24",

        // Garbage
        "",
        " ",
        "/24",
        "localhost/24",
        "foo",
        "undefined",
    ] as unknown as typeof CidrSchema.Type[];

    const decode = Schema.decodeResult(CidrSchema);

    B.test.each(passCases)("should expect %p to pass validation", (a) => {
        const decoded = decode(a);
        B.expect(decoded._tag).toBe("Success");
    });

    B.test.each(failCases)("should expect %p to fail validation", (a) => {
        const decoded = decode(a);
        B.expect(decoded._tag).toBe("Failure");
    });
});