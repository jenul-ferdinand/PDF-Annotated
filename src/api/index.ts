import * as vscode from "vscode";
import PDFEdit from "../providers/editorProvider";
import Logger from "../services/logger";
import { WEBVIEW_OPTIONS } from "../constants/index.js";
import type { PdfDataProvider, PdfDataType, PdfPreviewOptions } from "../types";

export const DataTypeEnum = {
  BASE64STRING: "base64",
  UINT8ARRAY: "u8array",
} as const;

export class PdfFileDataProvider implements PdfDataProvider {
  static DataTypeEnum = DataTypeEnum;

  type: PdfDataType;
  data: string | Uint8Array;
  name: string;

  constructor(type: PdfDataType, data: string | Uint8Array) {
    this.type = type;
    this.data = data;
    this.name = "PDF Annotated (via API)";
  }

  static fromBase64String(base64Data: string) {
    return new PdfFileDataProvider(DataTypeEnum.BASE64STRING, base64Data);
  }

  static fromUint8Array(u8array: Uint8Array) {
    return new PdfFileDataProvider(DataTypeEnum.UINT8ARRAY, u8array);
  }

  withName(newName: string) {
    this.name = newName;
    return this;
  }


  async getFileData(): Promise<Uint8Array> {
    return this.getRawData();
  }

  getRawData(): Uint8Array {
    if (this.type === DataTypeEnum.UINT8ARRAY) {
      if (this.data instanceof Uint8Array) {
        return this.data;
      }
      throw new TypeError("Expected Uint8Array PDF data");
    }
    if (this.type === DataTypeEnum.BASE64STRING) {
      if (typeof this.data !== "string") {
        throw new TypeError("Expected base64 PDF data");
      }
      // Node.js env in VS Code provides Buffer
      const buffer = Buffer.from(this.data, 'base64');
      return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    }
    throw new TypeError("Unknown data type " + this.type);
  }

}


export default class PdfViewerApi {
  static PdfFileDataProvider = PdfFileDataProvider;

  static previewPdfFile(provider: PdfFileDataProvider, options: PdfPreviewOptions = {}) {
    const panelTitle = options.name || provider.name;
    if (options.name) {
      provider.withName(options.name);
    }

    Logger.log(`API: Creating preview for: ${panelTitle}`);
    const panel = vscode.window.createWebviewPanel(
      "pdfAnnotated.apiCreatedPreview",
      panelTitle,
      vscode.ViewColumn.Active,
      WEBVIEW_OPTIONS
    );
    void PDFEdit.previewPdfFile(provider, panel, options);
  }
}
