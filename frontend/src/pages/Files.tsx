import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Upload, Trash2, File as FileIcon, Loader2, FileCode2, ChevronDown } from "lucide-react";
import { fileService } from "@/services/file.service";
import { FileItem } from "@/types";
import { cn } from "@/utils/cn";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileKind(mime: string): "doc" | "code" | "media" | "other" {
  if (mime.includes("pdf") || mime.includes("word") || mime.includes("text") || mime.includes("sheet") || mime.includes("presentation")) return "doc";
  if (mime.includes("javascript") || mime.includes("json") || mime.includes("xml") || mime.includes("html") || mime.includes("python") || mime.includes("typescript")) return "code";
  if (mime.startsWith("image/") || mime.startsWith("audio/") || mime.startsWith("video/")) return "media";
  return "other";
}

export function Files() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadFiles = async () => {
    try {
      const { data } = await fileService.getFiles();
      setFiles(data);
    } catch (error) {
      console.error("Failed to load files:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadFiles(); }, []);

  const uploadFile = async (file: File) => {
    setUploading(true);
    try {
      const { data } = await fileService.upload(file);
      setFiles((prev) => [
        { id: data.id, filename: data.filename, originalName: data.originalName, mimeType: data.mimeType, size: data.size, extractedText: data.extractedText, createdAt: new Date().toISOString() },
        ...prev,
      ]);
    } catch (error: any) {
      console.error("Upload failed:", error.response?.data?.error || error);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  };

  const deleteFile = async (id: string) => {
    if (!window.confirm("Delete this file permanently? This can't be undone.")) return;
    try {
      await fileService.deleteFile(id);
      setFiles((prev) => prev.filter((f) => f.id !== id));
    } catch (error) {
      console.error("Delete failed:", error);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="w-6 h-6 text-primary" /> Files</h1>
        <p className="text-muted-foreground mt-1">Upload documents — text is extracted automatically and can be used in chat</p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors",
          dragActive ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 hover:bg-muted/50"
        )}
      >
        <input type="file" ref={inputRef} onChange={handleSelect} className="hidden" />
        {uploading ? (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p>Uploading and extracting text...</p>
          </div>
        ) : (
          <>
            <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium">Drag & drop a file here, or click to browse</p>
            <p className="text-sm text-muted-foreground mt-1">PDF, DOCX, PPTX, XLSX, images, audio and more</p>
          </>
        )}
      </div>

      {/* File list */}
      <div className="mt-8 space-y-2">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : files.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No files yet</p>
            <p className="text-sm">Upload your first document above</p>
          </div>
        ) : (
          <AnimatePresence>
            {files.map((file, index) => {
              const kind = fileKind(file.mimeType);
              const isOpen = expanded === file.id;
              return (
                <motion.div
                  key={file.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className="border border-border rounded-lg overflow-hidden"
                >
                  <div className="flex items-center gap-3 p-3 hover:bg-accent/50 transition-colors">
                    <div className={cn("p-2 rounded-lg shrink-0", kind === "code" ? "bg-blue-500/10 text-blue-500" : kind === "media" ? "bg-green-500/10 text-green-500" : "bg-primary/10 text-primary")}>
                      {kind === "code" ? <FileCode2 className="w-4 h-4" /> : <FileIcon className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{file.originalName}</p>
                      <p className="text-xs text-muted-foreground">{formatBytes(file.size)} · {file.mimeType || "unknown type"}</p>
                    </div>
                    <button onClick={() => setExpanded(isOpen ? null : file.id)} className="p-2 rounded-lg hover:bg-accent transition-colors" aria-label="Toggle text preview">
                      <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")} />
                    </button>
                    <button onClick={() => deleteFile(file.id)} className="p-2 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors" aria-label="Delete file">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {isOpen && (
                    <div className="px-4 pb-4">
                      <pre className="bg-muted/60 border border-border rounded-lg p-3 text-xs whitespace-pre-wrap max-h-48 overflow-y-auto text-muted-foreground">
                        {file.extractedText || "No extractable text found in this file."}
                      </pre>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
