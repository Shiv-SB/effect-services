import * as B from "bun:test";
import { murmur3_32 } from "../../src/internals/hash";

const wrapper = (item: string, seed?: number) => murmur3_32(Buffer.from(item), seed);

B.describe(murmur3_32, () => {
    B.test("expect values to match Bun impl", () => {
        const input = crypto.randomUUID();
        const seed = Math.floor(Math.random() * 1_000);
        const h1 = Bun.hash.murmur32v3(input, seed);
        const h2 = wrapper(input, seed);

        B.expect(h2).toBe(h1);
    }, { repeats: 10_000 });
});