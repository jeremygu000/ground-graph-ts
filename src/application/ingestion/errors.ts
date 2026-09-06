export type IngestionReasonCode = "UNSUPPORTED_FORMAT";

export class IngestionParserError extends Error {
  readonly reasonCode: IngestionReasonCode;

  constructor(reasonCode: IngestionReasonCode, message: string) {
    super(message);
    this.name = "IngestionParserError";
    this.reasonCode = reasonCode;
  }
}
