import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import { env } from "../config/env";
import { logger } from "../config/logger";

export interface FileProcessResult {
  text: string;
  metadata?: Record<string, any>;
  embeddings?: number[];
}

export async function processFile(filePath: string): Promise<FileProcessResult> {
  if (env.ENABLE_FILE_PROCESSOR !== "true") {
    return { text: "File processing disabled" };
  }

  try {
    const form = new FormData();
    form.append("file", fs.createReadStream(filePath));

    const response = await axios.post(`${env.FILE_PROCESSOR_URL}/process`, form, {
      headers: form.getHeaders(),
      timeout: parseInt(env.FILE_PROCESSOR_TIMEOUT),
    });

    return response.data;
  } catch (error) {
    logger.error("File processing error:", error);
    // Fallback: return empty text
    return { text: "" };
  }
}

/** Friendly labels for the MIME types the processor advertises. */
const SUPPORTED_TYPE_LABELS: Record<string, string> = {
  "text/plain": "TXT",
  "text/csv": "CSV",
  "text/html": "HTML",
  "text/markdown": "Markdown",
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "application/msword": "DOC",
  "application/vnd.ms-excel": "XLS",
  "application/vnd.ms-powerpoint": "PPT",
  "application/zip": "ZIP",
};

/** Static list used when the processor is unreachable or disabled. */
const FALLBACK_SUPPORTED_TYPES = [
  "PDF", "DOC", "DOCX", "XLSX", "PPTX", "CSV", "TXT", "RTF",
  "Code", "Images", "Audio", "Video", "Archives",
];

/**
 * Ask the file processor what it can extract, returning friendly labels.
 * Falls back to a static list when the processor is disabled/unreachable so
 * the UI never goes blank.
 */
export async function getSupportedTypes(): Promise<{ types: string[]; source: "processor" | "fallback" }> {
  if (env.ENABLE_FILE_PROCESSOR !== "true") {
    return { types: FALLBACK_SUPPORTED_TYPES, source: "fallback" };
  }
  try {
    const response = await axios.get(`${env.FILE_PROCESSOR_URL}/supported-types`, {
      timeout: 5000,
    });
    const mimes: string[] = Array.isArray(response.data?.types) ? response.data.types : [];
    const seen = new Set<string>();
    const labels: string[] = [];
    for (const mime of mimes) {
      let label = SUPPORTED_TYPE_LABELS[mime];
      if (!label) {
        if (mime.startsWith("image/")) label = "Images";
        else if (mime.startsWith("audio/")) label = "Audio";
        else if (mime.startsWith("video/")) label = "Video";
        else if (mime.startsWith("text/")) label = mime.split("/")[1]?.toUpperCase() || mime;
        else label = mime.split("/")[1]?.toUpperCase() || mime;
      }
      if (!seen.has(label)) {
        seen.add(label);
        labels.push(label);
      }
    }
    return {
      types: labels.length ? labels : FALLBACK_SUPPORTED_TYPES,
      source: "processor",
    };
  } catch (error) {
    logger.warn("Supported-types fetch failed, using fallback:", error);
    return { types: FALLBACK_SUPPORTED_TYPES, source: "fallback" };
  }
}

export async function processFilePath(filePath: string): Promise<FileProcessResult> {
  if (env.ENABLE_FILE_PROCESSOR !== "true") {
    return { text: "File processing disabled" };
  }

  try {
    // The processor's /process-path endpoint takes file_path as a query
    // parameter (it is not a body field), so it must go in `params`.
    const response = await axios.post(
      `${env.FILE_PROCESSOR_URL}/process-path`,
      null,
      {
        params: { file_path: filePath },
        timeout: parseInt(env.FILE_PROCESSOR_TIMEOUT),
      }
    );

    return response.data;
  } catch (error) {
    logger.error("File path processing error:", error);
    return { text: "" };
  }
}
