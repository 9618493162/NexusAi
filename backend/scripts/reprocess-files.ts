/**
 * Re-process file records whose extractedText is empty/blank so they can be
 * analyzed, without re-uploading. Uses the backend's own Prisma client and the
 * existing file-processor service (same pipeline as a fresh upload).
 *
 * Run from the backend folder:
 *   npx tsx scripts/reprocess-files.ts
 *
 * Only records with blank text ("", whitespace, null, or "File processing
 * disabled") are touched; files missing on disk are reported and skipped.
 */
import fs from "fs";
import { prisma } from "../src/config/database";
import { processFilePath } from "../src/services/file-processor.service";

const BLANK_TEXT = new Set(["", "File processing disabled"]);

// The processor runs in a Docker container where the backend's uploads folder
// is bind-mounted at /app/uploads. DB paths are Windows-style (e.g.
// "uploads\\abc.docx" or "C:\\...\\uploads\\abc.docx"), so normalize them to
// the container's view before asking the processor to read the file.
function toContainerPath(dbPath: string): string {
  const normalized = dbPath.replace(/\\/g, "/");
  const name = normalized.split("/").pop() || "";
  return `/app/uploads/${name}`;
}

function isBlank(text: string | null | undefined): boolean {
  if (!text) return true;
  return BLANK_TEXT.has(text.trim()) || text.trim().length === 0;
}

async function main() {
  const files = await prisma.file.findMany();
  const targets = files.filter((f) => isBlank(f.extractedText));

  console.log(`Total file records: ${files.length}`);
  console.log(`Records with blank extractedText: ${targets.length}`);
  console.log("");

  let ok = 0;
  let missing = 0;
  let failed = 0;

  for (const file of targets) {
    if (!fs.existsSync(file.path)) {
      console.log(`✗ ${file.originalName} — physical file missing on disk (${file.path}), skipped`);
      missing += 1;
      continue;
    }
    try {
      const result = await processFilePath(toContainerPath(file.path));
      const text = result.text || "";
      await prisma.file.update({
        where: { id: file.id },
        data: { extractedText: text },
      });
      const preview = text.trim().slice(0, 60).replace(/\s+/g, " ");
      console.log(`✓ ${file.originalName} — stored ${text.length} chars: ${preview || "(empty)"}`);
      ok += 1;
    } catch (error: any) {
      console.log(`✗ ${file.originalName} — re-processing failed: ${error.message}`);
      failed += 1;
    }
  }

  console.log("");
  console.log(`Done: ${ok} re-processed, ${missing} missing on disk, ${failed} failed.`);
  process.exit(0);
}

main().catch((error) => {
  console.error("Script failed:", error);
  process.exit(1);
});
