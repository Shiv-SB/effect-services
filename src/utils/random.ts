export class LCG {

    private seed: number;
    private a: number;
    private c: number;
    private m: number

    constructor() {
        this.seed = Date.now();
        this.a = 1664525;
        this.c = 1013904223;
        this.m = Math.pow(2, 32);
    }

    private nextInt() {
        this.seed = (this.a * this.seed + this.c) % this.m;
        return this.seed;
    }

    public randomInt(min: number, max: number): number {
        const range = max - min + 1;
        return Math.floor(this.nextInt() / (this.m / range)) + min;
    }

    public randomFloat(min: number, max: number): number {
        return this.nextInt() / this.m * (max - min) + min;
    }
}