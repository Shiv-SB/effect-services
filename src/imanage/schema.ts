import * as S from "effect/Schema";

export const OauthResposneSchema = S.Struct({
    access_token: S.String,
    expires_in: S.Int,
    token_type: S.Literal("Bearer"),
    scope: S.String,
    refresh_token: S.NullOr(S.String),
}).annotate({
    description: "/auth/oauth2/token",
});

const OptBool = S.optionalKey(S.Boolean);
const OptStr = S.optionalKey(S.String);
const OptInt = S.optionalKey(S.Int);
const OptUtc = S.optionalKey(S.DateTimeUtc);

const DefaultSecuritySchema = S.Literals(["public", "view", "private"]);
const AccessSchema = S.Literals(["no_access", "read", "read_write", "full_access", "change_security"]);
const ContentTypeSchema = S.Literals(["D", 5]);
const WsTypeSchema = S.Literals([
    "document",
    "folder",
    "workspace",
    "email",
    "document_shortcut",
    "folder_shortcut",
    "workspace_shortcut",
    "user",
]);

const AuditSchema = S.Struct({ comments: OptStr });

const TrusteesSchema = S.Array(S.Struct({
    id: S.String,
    access_level: S.optionalKey(AccessSchema),
}));

export const UploadDocumentRequestSchema = S.Struct({
    warnings_for_required_and_disabled_fields: OptBool,
    keep_locked: OptBool,
    audit: S.optionalKey(AuditSchema),
    inherit_profile_from_folder: OptBool,
    doc_profile: S.Struct({
        name: S.String,
        extension: OptStr,
        type: OptStr,
        size: OptInt,
        auther: OptStr,
        checksum: OptStr,
        class: OptStr,
        content_type: S.optionalKey(ContentTypeSchema),
        default_security: S.optionalKey(DefaultSecuritySchema),
        file_create_date: OptUtc,
        file_edit_date: OptUtc,
        is_hipaa: OptBool,
        retain_days: OptInt,
    }),
    user_trustees: S.optionalKey(TrusteesSchema),
    group_trustees: S.optionalKey(TrusteesSchema),
}).annotate({
    description: "/work/api/v2/customers/{customerId}/libraries/{libraryId}/folders/{folderId}/documents"
});

export const UploadDocumentResponseSchema = S.Struct({
    data: S.Struct({
        database: S.String,
        document_number: S.Int,
        version: S.Int,
        name: S.String,
        author: S.String,
        operator: OptStr,
        type: S.String,
        class: OptStr,
        edit_date: OptUtc,
        system_edit_date: OptUtc,
        create_date: S.DateTimeUtc,
        create_profile_date: OptUtc,
        retain_days: OptInt,
        size: S.Int,
        is_declared: OptBool,
        declared: OptBool,
        location: OptStr,
        default_security: S.optionalKey(DefaultSecuritySchema),
        last_user: OptStr,
        is_in_use: OptBool,
        is_checked_out: OptBool,
        comment: OptStr,
        access: S.optionalKey(AccessSchema),
        author_description: OptStr,
        operator_description: OptStr,
        type_description: OptStr,
        class_description: OptStr,
        last_user_description: OptStr,
        extension: S.String,
        content_type: S.optionalKey(ContentTypeSchema),
        edit_profile_date: OptUtc,
        is_external: OptBool,
        is_external_as_normal: OptBool,
        file_create_date: S.DateTimeUtc,
        file_edit_date: S.DateTimeUtc,
        is_hipaa: OptBool,
        workspace_name: OptStr,
        id: S.String,
        in_use: OptBool,
        indexable: OptBool,
        wstype: WsTypeSchema,
        iwl: S.String,
        workspace_id: S.String,
    }),
    warnings: S.Union([S.Tuple([]), S.Array(S.Struct({
        field: S.String,
        error: S.String,
    }))]),
}).annotate({
    description: "/work/api/v2/customers/{customerId}/libraries/{libraryId}/folders/{folderId}/documents",
});