import { Context, Data, Layer } from "effect";
import sql from "mssql";

export class MsSqlError extends Data.TaggedError("MsSqlError")<{
    message: string;
    cause: unknown;
    reason: "CONNECTION_ERROR"
    | "STREAM_ERROR"
    | "QUERY_ERROR"
    | "SYNC_ERROR"
    | "ASYNC_ERROR";
}> { }

export interface MsSqlConfigOpts extends sql.config { }

export class MsSqlConfig extends Context.Service<MsSqlConfig, MsSqlConfigOpts>()("effect-services/mssql/common/MsSqlConfig") { }

export const MsSqlConfigLayer = (opts: MsSqlConfigOpts) => Layer.succeed(MsSqlConfig, opts);