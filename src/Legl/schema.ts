import * as S from "effect/Schema";
import type { SchemaAST } from "effect";

const TaggedStruct = <
    Tag extends SchemaAST.LiteralValue,
    Fields extends S.Struct.Fields
>(
    tag: Tag,
    fields: Fields
) =>
    S.Struct({
        _tag: S.Literal(tag).pipe(
            S.optional,
            S.withDefaults({
                constructor: () => tag, // Apply _tag during instance construction
                decoding: () => tag // Apply _tag during decoding
            })
        ),
        ...fields
    });

export const LeglPaginationFields = S.Struct({
    count: S.Int,
    next: S.NullOr(S.URL),
    previous: S.NullOr(S.URL)
});

export const LeglPaginationFieldsWithResult = S.Struct({
    ...LeglPaginationFields.fields,
    results: S.Array(S.Unknown),
});

const StepTypeEnum = S.Literal("cdd", "source-of-funds", "document-request", "signature-request", "custom-form");

const CheckResultEnum = S.Literal("clear", "consider");

const CddResultSchema = TaggedStruct("CddResult", {
    client_information: S.Record({ key: S.String, value: S.String }),
    overall_result: S.NullOr(CheckResultEnum),
    id_data_validation_result: S.NullOr(CheckResultEnum),
    identity_validation_result: S.NullOr(CheckResultEnum),
    biometrics_result: S.NullOr(CheckResultEnum),
    peps_and_sanctions_result: S.NullOr(CheckResultEnum),
    financial_checks_result: S.NullOr(CheckResultEnum),
    id_data_validation_details: S.Struct({
        document_type: S.NullOr(S.String),
        document_expiry: S.NullOr(S.String),
    }),
});

const EnhancedCddResultSchema = TaggedStruct("EnhancedCddResult", {
    client_information: S.Record({ key: S.String, value: S.String }),
    overall_result: S.NullOr(CheckResultEnum),
    id_data_validation_result: S.NullOr(CheckResultEnum),
    peps_and_sanctions_result: S.NullOr(CheckResultEnum),
    financial_checks_result: S.NullOr(CheckResultEnum),
});

const SourcesList = S.Array(TaggedStruct("SourcesList", {
    amount: S.NullOr(S.Number),
    comment: S.NullOr(S.String),
    description: S.NullOr(S.String),
    income_source: S.NullOr(S.String),
    name: S.NullOr(S.String),
    is_recieved: S.NullOr(S.Boolean),
    salary: S.NullOr(S.Number),
    type: S.Literal(
        "gift", "inheritance", "investments-sale", "loan", "other", "property-sale", "remortgage", "mortgage", "savings"
    ),
    appears_on_statement_as: S.NullOr(S.String),
    is_pension_claimed: S.NullOr(S.Boolean),
    pension_provider: S.NullOr(S.String),
    pension_start: S.NullOr(S.DateTimeUtc),
    pension_frequency: S.NullOr(S.String),
    addresses: S.Array(S.Struct({
        type: S.Literal("lender", "property", "solicitor", "third_party"),
    }, { key: S.String, value: S.NullOr(S.String) })),
    overseas_funds: S.NullOr(S.Boolean),
}));

// If Arr then SourcesList, otherwise will be discriminated Cdd or Enhanced Cdd.
const StepResultsDataSchema = S.Union(
    CddResultSchema, EnhancedCddResultSchema, SourcesList,
).annotations({
    description:
        `On the API, this field will NOT be present unless the include_results query parameter is true. 
            The value will be null for all steps types except "cdd".
            For "source-of-funds", the value is only present on the retrieve endpoint, and will always be null on the list endpoint.
            in webhook payloads, this field will always be present`
});

const StepSchema = S.Struct({
    type: StepTypeEnum,
    results_document_url: S.NullOr(S.String),
    results_data: S.NullOr(StepResultsDataSchema),
});

const EngageRequestSchema = S.Struct({
    url: S.URL,
    submit_url: S.URL,
    reference: S.String,
    flow_name: S.String,
    first_name: S.NullOr(S.String),
    last_name: S.NullOr(S.String),
    email: S.NullOr(S.String),
    client_reference: S.NullOr(S.String),
    matter_refernece: S.NullOr(S.String),
    steps: S.Array(StepSchema),
    created_date: S.DateTimeUtc,
    completed_date: S.DateTimeUtc,
    completed_redirect_url: S.NullOr(S.URL),
    view_url: S.URL,
    status: S.Literal("Created", "Sent", "In progress", "Ready for review", "Reviewed", "Marked closed", "Processing"),
    hidden_reference: S.NullOr(S.String),
});

export const ListEngangeReqestSchema = S.Struct({
    ...LeglPaginationFields.fields,
    results: EngageRequestSchema,
});