declare module "pdf-parse" {
  interface PDFInfo {
    Title?: string;
    Author?: string;
    Subject?: string;
    Keywords?: string;
    Creator?: string;
    Producer?: string;
    CreationDate?: string;
    ModDate?: string;
  }

  interface PDFMetadata {
    info: PDFInfo;
    metadata: Buffer | null;
  }

  interface PDFData {
    numpages: number;
    numrender: number;
    info: PDFInfo;
    metadata: PDFMetadata | null;
    text: string;
    version: string;
  }

  interface PDFOptions {
    pagerender?: (pageData: {
      getTextContent: () => Promise<{ items: Array<{ str: string }> }>;
    }) => Promise<string>;
    max?: number;
    version?: string;
  }

  function pdf(dataBuffer: Buffer, options?: PDFOptions): Promise<PDFData>;
  export = pdf;
}

declare module "mammoth" {
  interface MammothOptions {
    styleMap?: string[];
    buffer?: Buffer;
  }

  interface TextItem {
    type: string;
    value: string;
  }

  interface Paragraph {
    results: Array<{ message: { type: string; message: string } }>;
    lines: Array<{
      results: Array<{ message: { type: string; message: string } }>;
      items: TextItem[];
    }>;
  }

  interface Text {
    value: string;
    paragraphs: Paragraph[];
  }

  interface MammothMessages {
    messages: Array<{
      type: string;
      message: string;
      messageCode: string;
      start: { line: number; column: number };
      end: { line: number; column: number };
    }>;
  }

  function extractRawText(options: MammothOptions): {
    promises: {
      then: (transformer: (result: { value: string }) => void) => void;
    };
  };

  function extractText(options?: MammothOptions): Promise<{ value: string } & MammothMessages>;

  export { extractText, extractRawText };
  export default { extractText, extractRawText };
}
