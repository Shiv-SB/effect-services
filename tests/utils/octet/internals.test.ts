import * as T from "@effect/vitest";
import * as B from "bun:test";
import * as O from "../../../src/utils/octet/index";
import { OctetSync } from "../../../src/utils/octet/octet-sync";
import { Effect } from "effect";
import { type Address } from '../../../src/utils/octet/schemas';
import * as common from "../../../src/utils/octet/common";

B.describe("Octet Internals", () => {
    B.describe("isPrivate", () => {
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
