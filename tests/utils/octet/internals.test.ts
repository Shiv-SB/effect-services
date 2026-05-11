import * as T from "@effect/vitest";
import * as B from "bun:test";
import * as O from "../../../src/utils/octet/index";
import { OctetSync } from "../../../src/utils/octet/octet-sync";
import { Effect } from "effect";
import { type Address } from '../../../src/utils/octet/schemas';
import * as common from "../../../src/utils/octet/common";

B.describe("Octet Internals", () => {
    B.describe(common.isPrivate, () => {
        const testCases: [Address, boolean][] = [
            // RFC1918 - 10.0.0.0/8
            ["10.0.0.0", true],
            ["10.0.0.1", true],
            ["10.255.255.255", true],
            ["10.100.0.1", true],

            // RFC1918 - 172.16.0.0/12
            ["172.16.0.0", true],
            ["172.16.0.1", true],
            ["172.20.10.5", true],
            ["172.31.100.1", true],
            ["172.31.255.255", true],

            // RFC1918 - 192.168.0.0/16
            ["192.168.0.0", true],
            ["192.168.0.1", true],
            ["192.168.1.1", true],
            ["192.168.255.255", true],

            // Public ranges adjacent to private boundaries
            ["9.255.255.255", false],
            ["11.0.0.0", false],
            ["172.15.255.255", false],
            ["172.32.0.0", false],
            ["192.167.255.255", false],
            ["192.169.0.0", false],

            // Common public IPs
            ["1.1.1.1", false],
            ["8.8.8.8", false],
            ["100.64.0.1", false],
            ["169.254.0.1", false],
            ["127.0.0.1", false],

            // CIDR inputs - private
            ["10.0.0.1/8", true],
            ["10.10.10.10/32", true],
            ["172.16.0.1/12", true],
            ["172.31.255.255/24", true],
            ["192.168.1.1/16", true],
            ["192.168.1.1/32", true],

            // CIDR inputs - public
            ["8.8.8.8/32", false],
            ["1.1.1.1/24", false],
            ["172.32.0.1/16", false],
            ["192.169.0.1/24", false],
        ];

        B.test.each(testCases)(`should expect %p to be %p if private`, (addr, expected) => {
            const result = common.isPrivate(addr);
            B.expect(result).toBe(expected);
        });
    });

    B.describe(common.numToIp, () => {
        const testCases: [number, string][] = [
            [0, "0.0.0.0"],
            [1, "0.0.0.1"],
            [-1, "255.255.255.255"],
            [-2, "255.255.255.254"],
            [10, "0.0.0.10"],
            [100, "0.0.0.100"],
            [256, "0.0.1.0"],
            [1024, "0.0.4.0"],
            [1025, "0.0.4.1"]
        ];

        B.test.each(testCases)("should expect %p to transform to %p", (n, expected) => {
            const result = common.numToIp(n);
            B.expect(result).toBe(expected);
        });
    });

    B.describe(common.addrStrToParts, () => {
        // This will only recieve validated Addresses, no need to fuzz test
        B.test("should correctly split address", () => {
            const addr = "192.168.0.1/24";
            const result = common.addrStrToParts(addr);
            B.expect(result).toStrictEqual({
                a: 192,
                b: 168,
                c: 0,
                d: 1,
                prefix: 24,
            });
        });

        B.test("should correctly spit 0.0.0.0", () => {
            const addr1 = "0.0.0.0";
            const addr2 = "0.0.0.0/0";
            const r1 = common.addrStrToParts(addr1);
            const r2 = common.addrStrToParts(addr2);

            B.expect(r1).toStrictEqual({
                a: 0,
                b: 0,
                c: 0,
                d: 0,
                prefix: 32
            });

            B.expect(r2).toStrictEqual({
                a: 0,
                b: 0,
                c: 0,
                d: 0,
                prefix: 0,
            });
        })

        B.test("should correctly default mask to /32", () => {
            const addr = "192.168.0.1";
            const result = common.addrStrToParts(addr).prefix;
            B.expect(result).toBe(32);
        });
    });

    B.describe(common.ipAddrToUInt, () => {
        // Doesnt take into account prefix so its ommited
        const testCases: [Omit<common.Parts, "prefix">, number][] = [
            [{ a: 192, b: 168, c: 0, d: 1 }, 3232235521],
            [{ a: 0, b: 0, c: 0, d: 0 }, 0],
            [{ a: 255, b: 255, c: 255, d: 255 }, 4294967295],
        ];

        B.test.each(testCases)("%j should convert to %p", (p, n) => {
            const r = common.ipAddrToUInt(p as common.Parts);
            B.expect(r).toBe(n);
        });
    });

    B.describe(common.prefixToUInt, () => {
        const testCases: [number, number][] = [
            [0, 0],
            [1, 2147483648],
            [2, 3221225472],
            [4, 4026531840],
            [12, 4293918720],
            [16, 4294901760],
            [32, 4294967295],
        ];

        B.test.each(testCases)("should correctly convert %p to %p", (mask, expected) => {
            const result = common.prefixToUInt(mask);
            B.expect(result).toBe(expected);
        });
    });

    B.describe(common.cidrToUInt, () => {
        const testCases: [common.Parts, number][] = [
            [{ a: 0, b: 0, c: 0, d: 0, prefix: 0 }, 0],
            [{ a: 255, b: 255, c: 255, d: 255, prefix: 32 }, -1],
            [{ a: 255, b: 255, c: 255, d: 255, prefix: 0 }, 0],
            [{ a: 192, b: 168, c: 0, d: 1, prefix: 24 }, -1062731776],
            [{ a: 10, b: 0, c: 0, d: 1, prefix: 24 }, 167772160],
        ];

        B.test.each(testCases)("%j should convert to %p", (p, n) => {
            const result = common.cidrToUInt(p);
            B.expect(result).toBe(n);
        });
    });

    B.describe(common.partsToBroadcastNumber, () => {
        const testCases: [common.Parts, number][] = [
            [{ a: 0, b: 0, c: 0, d: 0, prefix: 0 }, -1],
            [{ a: 0, b: 0, c: 0, d: 0, prefix: 24 }, 255],
            [{ a: 0, b: 0, c: 0, d: 0, prefix: 32 }, 0],
            [{ a: 192, b: 168, c: 0, d: 1, prefix: 16 }, -1062666241],
            [{ a: 192, b: 168, c: 0, d: 1, prefix: 24 }, -1062731521],
            [{ a: 192, b: 168, c: 0, d: 1, prefix: 30 }, -1062731773],
            [{ a: 192, b: 168, c: 0, d: 1, prefix: 32 }, -1062731775],
        ];

        B.test.each(testCases)("%j should convert to %p", (p, n) => {
            const result = common.partsToBroadcastNumber(p);
            B.expect(result).toBe(n);
        });
    });

    B.describe(common.hostmaskNum, () => {
        const testCases: [number, number][] = [
            [-1, 0],
            [0, -1],
            [2, -3],
            [16, -17],
            [30, -31],
            [255, -256],
            [-2, 1],
        ];

        B.test.each(testCases)("should convert %p to %p", (input, expected) => {
            const result = common.hostmaskNum(input);
            B.expect(result).toBe(expected);
        });
    });

    B.describe(common.getAddressCount, () => {
        B.test.serial("prefixes should match against correct size", () => {
            const prefixes = [...Array(33).keys()]; // [0, 1, ...32];

            const outputs: number[] = [];

            for (const prefix of prefixes) {
                const count = common.getAddressCount(prefix);
                outputs.push(count);
            }

            B.expect(outputs).toMatchSnapshot("prefix address sizes");
        });
    });

    B.describe.only(common.getFirst, () => {
        const testCases: [number, number, number][] = [
            // /31 and /32 should return the base unchanged
            [31, 0, 0],
            [31, 10, 10],
            [31, 3232235520, 3232235520], // 192.168.0.0

            [32, 0, 0],
            [32, 12345, 12345],
            [32, 4294967295, 4294967295], // 255.255.255.255

            // Anything below /31 should increment by 1
            [30, 0, 1],
            [30, 10, 11],
            [24, 3232235520, 3232235521], // 192.168.0.1
            [16, 167772160, 167772161],   // 10.0.0.1
            [8, 2886729728, 2886729729],  // 172.16.0.1

            // Edge-ish valid boundaries
            [1, 1, 2],
            [29, 4294967288, 4294967289],
            [0, 0, 1],
        ];

        B.test.each(testCases)("prefix %p and base %p should result in %p", (p, b, expected) => {
            const result = common.getFirst(p, b);
            B.expect(result).toBe(expected);
        });
    });
});


T.describe("Octet Sync", () => {
    T.effect("should construct with valid IP address", () => Effect.gen(function* () {
        const address = "192.168.0.1";
        const octet = yield* O.MakeSync({ address });
        T.expect(octet).toBeInstanceOf(OctetSync)
    }));

    T.effect("should construct with valid CIDR", () => Effect.gen(function* () {
        const address = "192.168.0.1/24";
        const octet = yield* O.MakeSync({ address });
        T.expect(octet).toBeInstanceOf(OctetSync);
    }));
});
