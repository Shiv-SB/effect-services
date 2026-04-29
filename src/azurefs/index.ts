import type { TokenCredential } from "@azure/identity";
import {
    ShareDirectoryClient,
    ShareFileClient,
    ShareServiceClient,
    StorageSharedKeyCredential,
    type DirectoryItem,
    type FileItem
} from "@azure/storage-file-share";
import { Context, Data, Effect, Layer, Option, Queue, Stream } from "effect";

interface AzureFsSdkConfigOpts {
    url: string;
    credential: TokenCredential | StorageSharedKeyCredential;
}

class AzureFsSdkConfig extends Context.Service<AzureFsSdkConfig, AzureFsSdkConfigOpts>()("AzureFsSdkConfig") { }

const AzureFsSdkConfigLayer = (opts: AzureFsSdkConfigOpts) => Layer.succeed(AzureFsSdkConfig, opts);

export class AzureFsSdkError extends Data.TaggedError("AzureFsSdkError")<{
    message: string;
    cause?: unknown;
}> { };

interface AzureFsSdkImpl {
    use: <T>(
        fn: (client: ShareServiceClient) => T
    ) => Effect.Effect<Awaited<T>, AzureFsSdkError>;
}

export class AzureFsSdkClient extends Context.Service<AzureFsSdkClient>()("AzureFsSdkClient", {
    make: Effect.gen(function* () {
        const config = yield* AzureFsSdkConfig;
        const _client = new ShareServiceClient(config.url, config.credential);

        const caller: AzureFsSdkImpl = {
            use: (fn) => Effect.gen(function* () {
                const result = yield* Effect.try({
                    try: () => fn(_client),
                    catch: (e) => new AzureFsSdkError({
                        cause: e,
                        message: "Syncronous error in 'AzureFsSdkClient.use'"
                    })
                });

                if (result instanceof Promise) {
                    return yield* Effect.tryPromise({
                        try: () => result,
                        catch: (e) => new AzureFsSdkError({
                            cause: e,
                            message: "Asyncronous error in 'AzureFsSdkClient.use'",
                        })
                    });
                } else {
                    return result;
                }
            })
        }
        return caller;
    })
}) {
    static readonly layer = (opts: AzureFsSdkConfigOpts) => Layer.effect(this, this.make).pipe(
        Layer.provide(AzureFsSdkConfigLayer(opts))
    );
}

export const DirectoryClient = Context.Service<ShareDirectoryClient>("ShareDirectoryClient");
export const FileClient = Context.Service<ShareFileClient>("FileClient");

export type FileType = {
    kind: "file";
} & FileItem;

export type DirType = {
    kind: "directory";
} & DirectoryItem

export type RecordType = FileType | DirType;

type StreamReturnType = Stream.Stream<Option.Option<RecordType>, never>;

/**
 * A handy utility function to list all items in a given directory.
 * 
 * Due to the nature of the stream generation, the stream
 * will never throw an error. Instead it will return early with Option.none()
 * and log an error.
 */
export const ToStream = Effect.gen(function* () {
    const client = yield* DirectoryClient;
    const iter = client.listFilesAndDirectories();

    const getNext = Effect.tryPromise({
        try: () => iter.next(),
        catch: (e) => new AzureFsSdkError({
            cause: e,
            message: "Asyncronous error in ToStream"
        })
    });

    const stream: StreamReturnType = Stream.callback((q) => Effect.gen(function* () {
        let { done, value } = yield* getNext;
        while (!done) {
            Queue.offerUnsafe(q, Option.some(value));
            ({ done, value } = yield* getNext);
        }

        Queue.endUnsafe(q);
    }).pipe(Effect.catch((e) => Effect.gen(function* () {
        yield* Effect.logError("Unable to complete stream", e);
        // cant emit errors with Stream.callback
        // so return empty instead
        return Option.none();
    }))));

    return stream;
});