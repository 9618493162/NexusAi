import multer from "multer";
import path from "path";
import { v4 as uuidv4 } from "uuid";

export const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const allowedExtensions = [
  // Text & documents
  "txt", "csv", "tsv", "html", "htm", "md", "markdown", "json", "xml",
  "yml", "yaml", "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "rtf",
  "odt", "ods", "odp", "epub", "log", "ini", "cfg", "conf", "env", "toml",
  // Code
  "js", "jsx", "ts", "tsx", "py", "java", "c", "h", "cpp", "hpp", "cs",
  "go", "rs", "rb", "php", "sh", "bash", "sql", "css", "scss", "sass",
  "less", "ipynb", "swift", "kt", "lua", "pl", "r", "dart", "vue", "svelte",
  // Images
  "jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "ico", "avif", "tiff",
  // Audio
  "mp3", "wav", "ogg", "m4a", "aac", "flac", "wma", "opus",
  // Video
  "mp4", "avi", "mov", "webm", "mkv", "m4v", "wmv", "flv", "mpeg",
  // Archives
  "zip", "rar", "7z", "tar", "gz", "bz2", "xz", "tgz",
];

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const ext = path.extname(file.originalname).slice(1).toLowerCase();
  const mime = (file.mimetype || "").toLowerCase();

  const mimeOk =
    mime.startsWith("text/") ||
    mime.startsWith("image/") ||
    mime.startsWith("audio/") ||
    mime.startsWith("video/") ||
    mime === "application/pdf" ||
    mime === "application/zip" ||
    mime === "application/json" ||
    mime.includes("openxmlformats") ||
    mime === "application/msword" ||
    mime === "application/vnd.ms-excel" ||
    mime === "application/vnd.ms-powerpoint";

  if (allowedExtensions.includes(ext) || mimeOk) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${ext || file.mimetype}. Supported: text/PDF/Office/code files, images, audio, video, archives (max 50MB).`));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
});

// Profile-picture uploads: images only, much smaller limit, same storage so
// the file lands in uploads/ and is served back through /api/auth/avatar.
const AVATAR_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);

export const avatarUpload = multer({
  storage,
  fileFilter: (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const ext = path.extname(file.originalname).slice(1).toLowerCase();
    const mime = (file.mimetype || "").toLowerCase();
    if (AVATAR_EXTENSIONS.has(ext) && mime.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Avatar must be a JPG, PNG, GIF or WEBP image."));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});
