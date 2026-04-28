import { Redacted } from "effect";

export function unwravel(secret: Redacted.Redacted<string> | string): string {
    if (Redacted.isRedacted(secret)) return Redacted.value(secret);
    return secret;
}