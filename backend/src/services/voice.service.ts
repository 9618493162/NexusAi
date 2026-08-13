import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { env } from "../config/env";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { logger } from "../config/logger";
import { prisma } from "../config/database";

const DEEPGRAM_BASE = "https://api.deepgram.com/v1";
const STT_MODEL = "nova-3";

// ---- TTS audio cache ----
// Synthesized replies are cached in memory (LRU) and on disk so repeating the
// same (text, voice) doesn't hit Deepgram/Edge TTS again. Files land in
// <backend>/data/tts-cache and survive restarts.
const TTS_CACHE_DIR = path.join(process.cwd(), "data", "tts-cache");
const TTS_CACHE_MAX_ENTRIES = 300;
const memCache = new Map<string, Buffer>();

function ttsCacheKey(provider: "dg" | "edge", voiceId: string, text: string): string {
  return createHash("sha256").update(`${provider}|${voiceId}|${text}`).digest("hex").slice(0, 32);
}

async function ttsCacheGet(key: string): Promise<Buffer | null> {
  const mem = memCache.get(key);
  if (mem) {
    // Refresh LRU position.
    memCache.delete(key);
    memCache.set(key, mem);
    return mem;
  }
  try {
    const buf = await fs.readFile(path.join(TTS_CACHE_DIR, `${key}.mp3`));
    memCache.set(key, buf);
    return buf;
  } catch {
    return null;
  }
}

async function ttsCacheSet(key: string, audio: Buffer): Promise<void> {
  memCache.set(key, audio);
  if (memCache.size > TTS_CACHE_MAX_ENTRIES) {
    const oldest = memCache.keys().next().value;
    if (oldest) memCache.delete(oldest);
  }
  try {
    await fs.mkdir(TTS_CACHE_DIR, { recursive: true });
    await fs.writeFile(path.join(TTS_CACHE_DIR, `${key}.mp3`), audio);
  } catch {
    // Cache writes are best-effort.
  }
}

// Free multilingual neural voices via Microsoft Edge's Read Aloud API.
// Deepgram aura-2 voices on this account are English-only, so non-English
// replies are synthesized here. Every entry below was verified against the
// live endpoint (57 voices across 29 languages). Languages/voices that no
// longer exist on Edge (e.g. Punjabi entirely, Hindi male voices) are
// intentionally absent so the caller falls back to browser speech.
export interface EdgeVoice {
  id: string;
  language: string;
  name: string;
  gender: "Female" | "Male";
}

export const EDGE_VOICES: EdgeVoice[] = [
  { id: "en-IN-NeerjaNeural", language: "en", name: "Neerja", gender: "Female" },
  { id: "en-IN-PrabhatNeural", language: "en", name: "Prabhat", gender: "Male" },
  { id: "hi-IN-MadhurNeural", language: "hi", name: "Madhur", gender: "Female" },
  { id: "te-IN-ShrutiNeural", language: "te", name: "Shruti", gender: "Female" },
  { id: "te-IN-MohanNeural", language: "te", name: "Mohan", gender: "Male" },
  { id: "ta-IN-PallaviNeural", language: "ta", name: "Pallavi", gender: "Female" },
  { id: "ta-IN-ValluvarNeural", language: "ta", name: "Valluvar", gender: "Male" },
  { id: "kn-IN-SapnaNeural", language: "kn", name: "Sapna", gender: "Female" },
  { id: "kn-IN-GaganNeural", language: "kn", name: "Gagan", gender: "Male" },
  { id: "ml-IN-SobhanaNeural", language: "ml", name: "Sobhana", gender: "Female" },
  { id: "ml-IN-MidhunNeural", language: "ml", name: "Midhun", gender: "Male" },
  { id: "bn-IN-TanishaaNeural", language: "bn", name: "Tanishaa", gender: "Female" },
  { id: "bn-IN-BashkarNeural", language: "bn", name: "Bashkar", gender: "Male" },
  { id: "mr-IN-AarohiNeural", language: "mr", name: "Aarohi", gender: "Female" },
  { id: "mr-IN-ManoharNeural", language: "mr", name: "Manohar", gender: "Male" },
  { id: "gu-IN-DhwaniNeural", language: "gu", name: "Dhwani", gender: "Female" },
  { id: "gu-IN-NiranjanNeural", language: "gu", name: "Niranjan", gender: "Male" },
  { id: "ur-PK-UzmaNeural", language: "ur", name: "Uzma", gender: "Female" },
  { id: "ur-PK-AsadNeural", language: "ur", name: "Asad", gender: "Male" },
  { id: "ne-NP-HemkalaNeural", language: "ne", name: "Hemkala", gender: "Female" },
  { id: "ne-NP-SagarNeural", language: "ne", name: "Sagar", gender: "Male" },
  { id: "es-ES-ElviraNeural", language: "es", name: "Elvira", gender: "Female" },
  { id: "es-ES-AlvaroNeural", language: "es", name: "Alvaro", gender: "Male" },
  { id: "fr-FR-DeniseNeural", language: "fr", name: "Denise", gender: "Female" },
  { id: "fr-FR-HenriNeural", language: "fr", name: "Henri", gender: "Male" },
  { id: "de-DE-KatjaNeural", language: "de", name: "Katja", gender: "Female" },
  { id: "de-DE-ConradNeural", language: "de", name: "Conrad", gender: "Male" },
  { id: "it-IT-ElsaNeural", language: "it", name: "Elsa", gender: "Female" },
  { id: "it-IT-DiegoNeural", language: "it", name: "Diego", gender: "Male" },
  { id: "pt-BR-FranciscaNeural", language: "pt", name: "Francisca", gender: "Female" },
  { id: "pt-BR-AntonioNeural", language: "pt", name: "Antonio", gender: "Male" },
  { id: "ru-RU-SvetlanaNeural", language: "ru", name: "Svetlana", gender: "Female" },
  { id: "ru-RU-DmitryNeural", language: "ru", name: "Dmitry", gender: "Male" },
  { id: "ja-JP-NanamiNeural", language: "ja", name: "Nanami", gender: "Female" },
  { id: "ja-JP-KeitaNeural", language: "ja", name: "Keita", gender: "Male" },
  { id: "ko-KR-SunHiNeural", language: "ko", name: "SunHi", gender: "Female" },
  { id: "ko-KR-InJoonNeural", language: "ko", name: "InJoon", gender: "Male" },
  { id: "zh-CN-XiaoxiaoNeural", language: "zh", name: "Xiaoxiao", gender: "Female" },
  { id: "zh-CN-YunxiNeural", language: "zh", name: "Yunxi", gender: "Male" },
  { id: "ar-SA-ZariyahNeural", language: "ar", name: "Zariyah", gender: "Female" },
  { id: "ar-SA-HamedNeural", language: "ar", name: "Hamed", gender: "Male" },
  { id: "tr-TR-EmelNeural", language: "tr", name: "Emel", gender: "Female" },
  { id: "tr-TR-AhmetNeural", language: "tr", name: "Ahmet", gender: "Male" },
  { id: "id-ID-GadisNeural", language: "id", name: "Gadis", gender: "Female" },
  { id: "id-ID-ArdiNeural", language: "id", name: "Ardi", gender: "Male" },
  { id: "vi-VN-HoaiMyNeural", language: "vi", name: "HoaiMy", gender: "Female" },
  { id: "vi-VN-NamMinhNeural", language: "vi", name: "NamMinh", gender: "Male" },
  { id: "th-TH-PremwadeeNeural", language: "th", name: "Premwadee", gender: "Female" },
  { id: "th-TH-NiwatNeural", language: "th", name: "Niwat", gender: "Male" },
  { id: "nl-NL-ColetteNeural", language: "nl", name: "Colette", gender: "Female" },
  { id: "nl-NL-MaartenNeural", language: "nl", name: "Maarten", gender: "Male" },
  { id: "pl-PL-ZofiaNeural", language: "pl", name: "Zofia", gender: "Female" },
  { id: "pl-PL-MarekNeural", language: "pl", name: "Marek", gender: "Male" },
  { id: "sv-SE-SofieNeural", language: "sv", name: "Sofie", gender: "Female" },
  { id: "sv-SE-MattiasNeural", language: "sv", name: "Mattias", gender: "Male" },
  { id: "el-GR-AthinaNeural", language: "el", name: "Athina", gender: "Female" },
  { id: "el-GR-NestorasNeural", language: "el", name: "Nestoras", gender: "Male" },
];

export function getEdgeVoices(): EdgeVoice[] {
  return EDGE_VOICES;
}

// Pick the voice to use for a language: the requested Edge voice if it's
// valid for that language, otherwise the first (default) voice of the
// language, otherwise null (no server-side voice — caller falls back).
export function resolveEdgeVoice(language: string, voice?: string): string | null {
  const forLang = EDGE_VOICES.filter((v) => v.language === language);
  if (!forLang.length) return null;
  if (voice && forLang.some((v) => v.id === voice)) return voice;
  return forLang[0].id;
}

// Languages supported by Deepgram Nova-3 STT (language codes match Deepgram's
// accepted values) plus the BCP-47 tag used by the browser's speech synthesis
// to speak translated replies when Deepgram TTS can't (Deepgram aura-2 voices
// on this account's tier are English-only).
export const LANGUAGES = [
  { code: "en", name: "English", bcp47: "en-US" },
  { code: "hi", name: "Hindi", bcp47: "hi-IN" },
  { code: "te", name: "Telugu", bcp47: "te-IN" },
  { code: "ta", name: "Tamil", bcp47: "ta-IN" },
  { code: "kn", name: "Kannada", bcp47: "kn-IN" },
  { code: "ml", name: "Malayalam", bcp47: "ml-IN" },
  { code: "bn", name: "Bengali", bcp47: "bn-IN" },
  { code: "mr", name: "Marathi", bcp47: "mr-IN" },
  { code: "gu", name: "Gujarati", bcp47: "gu-IN" },
  { code: "pa", name: "Punjabi", bcp47: "pa-IN" },
  { code: "ur", name: "Urdu", bcp47: "ur-PK" },
  { code: "ne", name: "Nepali", bcp47: "ne-NP" },
  { code: "es", name: "Spanish", bcp47: "es-ES" },
  { code: "fr", name: "French", bcp47: "fr-FR" },
  { code: "de", name: "German", bcp47: "de-DE" },
  { code: "it", name: "Italian", bcp47: "it-IT" },
  { code: "pt", name: "Portuguese", bcp47: "pt-BR" },
  { code: "ru", name: "Russian", bcp47: "ru-RU" },
  { code: "ja", name: "Japanese", bcp47: "ja-JP" },
  { code: "ko", name: "Korean", bcp47: "ko-KR" },
  { code: "zh", name: "Chinese (Mandarin)", bcp47: "zh-CN" },
  { code: "ar", name: "Arabic", bcp47: "ar-SA" },
  { code: "tr", name: "Turkish", bcp47: "tr-TR" },
  { code: "id", name: "Indonesian", bcp47: "id-ID" },
  { code: "vi", name: "Vietnamese", bcp47: "vi-VN" },
  { code: "th", name: "Thai", bcp47: "th-TH" },
  { code: "nl", name: "Dutch", bcp47: "nl-NL" },
  { code: "pl", name: "Polish", bcp47: "pl-PL" },
  { code: "sv", name: "Swedish", bcp47: "sv-SE" },
  { code: "el", name: "Greek", bcp47: "el-GR" },
];

export function getLanguages(): Array<{ code: string; name: string; bcp47: string }> {
  return LANGUAGES;
}

export function isValidLanguage(code?: string): boolean {
  return !!code && LANGUAGES.some((l) => l.code === code);
}

// Aura-2 TTS voices verified to work on this account's tier. Keep this list
// in sync with what Deepgram actually accepts for the configured key — the
// /voices endpoint below is the single source of truth for the UI.
const TTS_VOICES = [
  { id: "aura-2-thalia-en", name: "Thalia", language: "English" },
  { id: "aura-2-orion-en", name: "Orion", language: "English" },
  { id: "aura-2-asteria-en", name: "Asteria", language: "English" },
  { id: "aura-2-luna-en", name: "Luna", language: "English" },
  { id: "aura-2-athena-en", name: "Athena", language: "English" },
  { id: "aura-2-zeus-en", name: "Zeus", language: "English" },
  { id: "aura-2-iris-en", name: "Iris", language: "English" },
];

const DEFAULT_VOICE = "aura-2-thalia-en";

function dgKey(): string {
  return env.DEEPGRAM_API_KEY || "";
}

export function getVoices(): Array<{ id: string; name: string; language: string }> {
  return TTS_VOICES;
}

function validVoice(voice?: string): string {
  return TTS_VOICES.some((v) => v.id === voice) ? voice! : DEFAULT_VOICE;
}

// Speech-to-text: send raw audio bytes, get back the transcript plus per-word
// timestamps (word, start, end in seconds) so the studio can render a
// seekable, highlighted transcript. Deepgram's Nova-3 accepts
// webm/ogg/wav/mp3/m4a — whatever the browser mic records.
export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  contentType: string,
  language?: string
): Promise<{ transcript: string; words: TranscriptWord[] }> {
  if (!dgKey()) throw new Error("Deepgram is not configured (DEEPGRAM_API_KEY missing)");
  const langParam = isValidLanguage(language) ? `&language=${language}` : "";
  const res = await fetch(
    `${DEEPGRAM_BASE}/listen?model=${STT_MODEL}&smart_format=true&punctuate=true${langParam}`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${dgKey()}`,
        "Content-Type": contentType || "audio/webm",
      },
      body: audioBuffer,
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Deepgram STT error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as any;
  const alt = data?.results?.channels?.[0]?.alternatives?.[0];
  const words: TranscriptWord[] = Array.isArray(alt?.words)
    ? alt.words.map((w: any) => ({
        word: typeof w?.word === "string" ? w.word : "",
        start: typeof w?.start === "number" ? w.start : 0,
        end: typeof w?.end === "number" ? w.end : 0,
        ...(typeof w?.confidence === "number" ? { confidence: w.confidence } : {}),
      }))
    : [];
  return { transcript: alt?.transcript || "", words };
}

// Text-to-speech: render text to speech audio (mp3), returned as raw bytes.
export async function synthesizeSpeech(text: string, voice?: string): Promise<{ audio: Buffer; contentType: string }> {
  if (!dgKey()) throw new Error("Deepgram is not configured (DEEPGRAM_API_KEY missing)");
  const model = validVoice(voice);
  const key = ttsCacheKey("dg", model, text);
  const cached = await ttsCacheGet(key);
  if (cached) {
    logger.info(`TTS cache hit (deepgram ${model})`);
    return { audio: cached, contentType: "audio/mpeg" };
  }
  const res = await fetch(`${DEEPGRAM_BASE}/speak?model=${model}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${dgKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Deepgram TTS error ${res.status}: ${body.slice(0, 200)}`);
  }
  const audio = Buffer.from(await res.arrayBuffer());
  await ttsCacheSet(key, audio);
  return { audio, contentType: res.headers.get("content-type") || "audio/mpeg" };
}

// Multilingual text-to-speech via Microsoft Edge's free neural voices.
// Returns null when the voice is unavailable (caller falls back).
export async function synthesizeSpeechMultilingual(
  text: string,
  voiceId: string
): Promise<{ audio: Buffer; contentType: string } | null> {
  const key = ttsCacheKey("edge", voiceId, text);
  const cached = await ttsCacheGet(key);
  if (cached) {
    logger.info(`TTS cache hit (edge ${voiceId})`);
    return { audio: cached, contentType: "audio/mpeg" };
  }
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(voiceId, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(text);
    const chunks: Buffer[] = [];
    for await (const chunk of audioStream as any) chunks.push(Buffer.from(chunk));
    const audio = Buffer.concat(chunks);
    if (audio.length < 100) return null;
    await ttsCacheSet(key, audio);
    return { audio, contentType: "audio/mpeg" };
  } finally {
    tts.close();
  }
}

// ---- Voice sessions (persisted history) ----
// Transcripts, translations and analyses are stored per user so the studio's
// history follows them across devices. The FK is indexed and cascades on user
// deletion (same convention as every other user-owned table).

export interface VoiceSessionInput {
  transcript: string;
  translation?: string;
  analysis?: string;
  sourceLang?: string;
  targetLang?: string;
}

export interface VoiceSessionUpdate {
  translation?: string;
  analysis?: string;
  sourceLang?: string;
  targetLang?: string;
}

export async function createVoiceSession(userId: string, data: VoiceSessionInput) {
  return prisma.voiceSession.create({
    data: {
      transcript: data.transcript.slice(0, 20000),
      translation: data.translation ? data.translation.slice(0, 20000) : null,
      analysis: data.analysis ? data.analysis.slice(0, 20000) : null,
      sourceLang: data.sourceLang || "en",
      targetLang: data.targetLang || "en",
      userId,
    },
  });
}

export async function listVoiceSessions(userId: string, limit = 50) {
  return prisma.voiceSession.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function updateVoiceSession(userId: string, id: string, data: VoiceSessionUpdate) {
  return prisma.voiceSession.updateMany({
    where: { id, userId },
    data: {
      ...(data.translation !== undefined ? { translation: data.translation.slice(0, 20000) } : {}),
      ...(data.analysis !== undefined ? { analysis: data.analysis.slice(0, 20000) } : {}),
      ...(data.sourceLang ? { sourceLang: data.sourceLang } : {}),
      ...(data.targetLang ? { targetLang: data.targetLang } : {}),
    },
  });
}

export async function deleteVoiceSession(userId: string, id: string) {
  return prisma.voiceSession.deleteMany({ where: { id, userId } });
}
