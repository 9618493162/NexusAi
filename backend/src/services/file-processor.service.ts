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

export async function processFilePath(filePath: string): Promise<FileProcessResult> {
  if (env.ENABLE_FILE_PROCESSOR !== "true") {
    return { text: "File processing disabled" };
  }

  try {
    const response = await axios.post(
      `${env.FILE_PROCESSOR_URL}/process-path`,
      { file_path: filePath },
      { timeout: parseInt(env.FILE_PROCESSOR_TIMEOUT) }
    );

    return response.data;
  } catch (error) {
    logger.error("File path processing error:", error);
    return { text: "" };
  }
}
