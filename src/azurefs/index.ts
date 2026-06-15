import type { TokenCredential } from "@azure/identity";
import {
    ShareDirectoryClient,
    ShareFileClient,
    ShareServiceClient,
    StorageSharedKeyCredential,
    type DirectoryItem,
    type FileItem
} from "@azure/storage-file-share";
import { Context, Data, Effect, Layer, Queue, Result, Stream } from "effect";

export interface AzureFsSdkConfigOpts {
    url: string;
    credential: TokenCredential | StorageSharedKeyCredential;
}

export class AzureFsSdkConfig extends Context.Service<AzureFsSdkConfig, AzureFsSdkConfigOpts>()("AzureFsSdkConfig") { }

export const AzureFsSdkConfigLayer = (opts: AzureFsSdkConfigOpts) => Layer.succeed(AzureFsSdkConfig, opts);

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

type StreamReturnType = Stream.Stream<RecordType, AzureFsSdkError>;

/**
 * A handy utility function to list all items in a given directory.
 * The given directory is specified via the Service requirement
 * (`ShareDirectoryClient`)
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
    }).pipe(
        Effect.result
    );

    const stream: StreamReturnType = Stream.callback((q) => Effect.gen(function* () {
        const getNextResult = yield* getNext;

        if (Result.isFailure(getNextResult)) {
            yield* Queue.fail(q, getNextResult.failure);
            return;
        }

        let { done, value } = getNextResult.success;

        while (!done) {
            Queue.offerUnsafe(q, value);
            const getNextResult = yield* getNext;

            if (Result.isFailure(getNextResult)) {
                yield* Queue.fail(q, getNextResult.failure);
            } else {
                ({ done, value } = getNextResult.success);
            }
        }

        yield* Queue.end(q);
    }));

    return stream;
});