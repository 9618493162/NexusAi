import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useLiveVoice } from "@/hooks/useLiveVoice";
import { getLiveSocketUrl } from "@/services/voice.service";

vi.mock("@/services/voice.service", () => ({
  getLiveSocketUrl: vi.fn(async (_language?: string) => "ws://mock/live"),
}));

const mockedGetLiveSocketUrl = vi.mocked(getLiveSocketUrl);

// A scriptable stand-in for the browser WebSocket, so tests can open the
// socket, dispatch Deepgram frames, and inspect what was sent — exactly the
// contract useLiveVoice relies on (constructor, OPEN constant, send, close,
// onopen/onmessage/onclose handlers, readyState).
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: unknown) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  // --- test helpers ---
  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  receive(frame: unknown) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

const makeStream = () =>
  ({ getTracks: () => [{ stop: vi.fn() }] }) as unknown as MediaStream;

// Minimal AudioContext stand-in: the hook only builds the PCM pipeline inside
// socket.onopen, so the fake just needs the three members it touches.
class FakeAudioContext {
  destination = {};
  createMediaStreamSource = vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() }));
  createScriptProcessor = vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    onaudioprocess: null as (() => void) | null,
  }));
  close = vi.fn(async () => {});
}

const word = (w: string, start?: number, end?: number) => ({ word: w, start, end });

function resultsFrame(partial: {
  transcript?: string;
  words?: unknown[];
  isFinal?: boolean;
}) {
  return {
    type: "Results",
    is_final: partial.isFinal ?? false,
    channel: {
      alternatives: [{ transcript: partial.transcript ?? "", words: partial.words ?? [] }],
    },
  };
}

type HookRef = { current: ReturnType<typeof useLiveVoice> };

async function startDictation(result: HookRef, language = "en") {
  await act(async () => {
    await result.current.start(language);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  MockWebSocket.instances = [];
  vi.stubGlobal("WebSocket", MockWebSocket);
  vi.stubGlobal("AudioContext", FakeAudioContext);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => makeStream()) },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("useLiveVoice Deepgram frame parsing", () => {
  it("streams interim frames as live text with non-final words", async () => {
    const onInterim = vi.fn();
    const { result } = renderHook(() => useLiveVoice({ onInterim }));
    await startDictation(result);
    const socket = MockWebSocket.instances[0];

    socket.receive(resultsFrame({ transcript: "hello", words: [word("hello", 0.1, 0.4)] }));
    expect(onInterim).toHaveBeenLastCalledWith("hello", [
      { word: "hello", start: 0.1, end: 0.4, isFinal: false },
    ]);

    socket.receive(
      resultsFrame({
        transcript: "hello world",
        words: [word("hello", 0.1, 0.4), word("world", 0.5, 0.9)],
      })
    );
    expect(onInterim).toHaveBeenLastCalledWith("hello world", [
      { word: "hello", start: 0.1, end: 0.4, isFinal: false },
      { word: "world", start: 0.5, end: 0.9, isFinal: false },
    ]);
  });

  it("merges final frames into the finalized text and flips their words to final", async () => {
    const onInterim = vi.fn();
    const { result } = renderHook(() => useLiveVoice({ onInterim }));
    await startDictation(result);
    const socket = MockWebSocket.instances[0];

    // Real Deepgram: interims accumulate, then a final frame marks the span.
    socket.receive(
      resultsFrame({
        transcript: "hello world",
        words: [word("hello", 0.1, 0.4), word("world", 0.5, 0.9)],
      })
    );
    socket.receive(
      resultsFrame({
        transcript: "hello world",
        words: [word("hello", 0.1, 0.4), word("world", 0.5, 0.9)],
        isFinal: true,
      })
    );
    expect(onInterim).toHaveBeenLastCalledWith("hello world", [
      { word: "hello", start: 0.1, end: 0.4, isFinal: true },
      { word: "world", start: 0.5, end: 0.9, isFinal: true },
    ]);

    // The next utterance's interim carries only the text since the last
    // final, and appends to the finalized text.
    socket.receive(
      resultsFrame({ transcript: "what", words: [word("what", 1.0, 1.3)] })
    );
    expect(onInterim).toHaveBeenLastCalledWith("hello world what", [
      { word: "hello", start: 0.1, end: 0.4, isFinal: true },
      { word: "world", start: 0.5, end: 0.9, isFinal: true },
      { word: "what", start: 1.0, end: 1.3, isFinal: false },
    ]);
  });

  it("filters empty/undefined words and defaults missing timestamps to 0", async () => {
    const onInterim = vi.fn();
    const { result } = renderHook(() => useLiveVoice({ onInterim }));
    await startDictation(result);
    const socket = MockWebSocket.instances[0];

    socket.receive(
      resultsFrame({
        transcript: "hi",
        words: [
          { word: "", start: 0, end: 0 },
          { word: "   ", start: 0, end: 0 },
          { word: undefined, start: undefined, end: undefined },
          { word: "hi" },
        ],
      })
    );
    expect(onInterim).toHaveBeenLastCalledWith("hi", [
      { word: "hi", start: 0, end: 0, isFinal: false },
    ]);
  });

  it("appends final text even when the frame carries no word list", async () => {
    const onInterim = vi.fn();
    const { result } = renderHook(() => useLiveVoice({ onInterim }));
    await startDictation(result);
    const socket = MockWebSocket.instances[0];

    socket.receive(resultsFrame({ transcript: "hello" }));
    socket.receive(resultsFrame({ transcript: "hello", isFinal: true }));
    expect(onInterim).toHaveBeenLastCalledWith("hello", []);
  });

  it("treats silent finals, non-Results, and malformed messages as no-ops", async () => {
    const onInterim = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useLiveVoice({ onInterim, onError }));
    await startDictation(result);
    const socket = MockWebSocket.instances[0];

    // An empty final at a silence boundary must NOT clobber the running interim.
    socket.receive(resultsFrame({ transcript: "hello", words: [word("hello", 0.1, 0.4)] }));
    socket.receive(resultsFrame({ transcript: "", isFinal: true }));
    socket.receive({ type: "Metadata", request_id: "abc" });
    socket.receive("not a real frame");

    expect(onInterim).toHaveBeenCalledTimes(1);
    expect(onInterim).toHaveBeenLastCalledWith("hello", [
      { word: "hello", start: 0.1, end: 0.4, isFinal: false },
    ]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("flushes the last interim result on stop when no final frame ever arrived", async () => {
    const onInterim = vi.fn();
    const onFinal = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useLiveVoice({ onInterim, onFinal, onError }));
    await startDictation(result);
    const socket = MockWebSocket.instances[0];
    act(() => socket.open());
    expect(result.current.listening).toBe(true);

    socket.receive(
      resultsFrame({
        transcript: "good morning",
        words: [word("good", 0.1, 0.4), word("morning", 0.5, 0.9)],
      })
    );

    act(() => result.current.stop());
    expect(socket.sent).toContainEqual(JSON.stringify({ type: "CloseStream" }));

    act(() => vi.advanceTimersByTime(1200));

    expect(result.current.listening).toBe(false);
    expect(onFinal).toHaveBeenCalledWith("good morning", [
      { word: "good", start: 0.1, end: 0.4, isFinal: false },
      { word: "morning", start: 0.5, end: 0.9, isFinal: false },
    ]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("prefers the finalized text over the interim when both exist at stop", async () => {
    const onFinal = vi.fn();
    const { result } = renderHook(() => useLiveVoice({ onFinal }));
    await startDictation(result);
    const socket = MockWebSocket.instances[0];
    act(() => socket.open());

    socket.receive(
      resultsFrame({
        transcript: "hello world",
        words: [word("hello", 0.1, 0.4), word("world", 0.5, 0.9)],
      })
    );
    socket.receive(
      resultsFrame({
        transcript: "hello world",
        words: [word("hello", 0.1, 0.4), word("world", 0.5, 0.9)],
        isFinal: true,
      })
    );

    act(() => result.current.stop());
    act(() => vi.advanceTimersByTime(1200));

    expect(onFinal).toHaveBeenCalledWith("hello world", [
      { word: "hello", start: 0.1, end: 0.4, isFinal: true },
      { word: "world", start: 0.5, end: 0.9, isFinal: true },
    ]);
  });

  it("reports a friendly error when stop() heard no speech at all", async () => {
    const onFinal = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useLiveVoice({ onFinal, onError }));
    await startDictation(result);
    act(() => MockWebSocket.instances[0].open());

    act(() => result.current.stop());
    act(() => vi.advanceTimersByTime(1200));

    expect(onFinal).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      "Couldn't hear any speech — tap the mic and try again."
    );
    expect(result.current.listening).toBe(false);
  });

  it("ignores a second stop() while the flush is pending", async () => {
    const onFinal = vi.fn();
    const { result } = renderHook(() => useLiveVoice({ onFinal }));
    await startDictation(result);
    const socket = MockWebSocket.instances[0];
    act(() => socket.open());
    socket.receive(
      resultsFrame({ transcript: "hello", isFinal: true, words: [word("hello", 0.1, 0.4)] })
    );

    act(() => result.current.stop());
    act(() => result.current.stop());
    act(() => vi.advanceTimersByTime(1200));

    expect(onFinal).toHaveBeenCalledTimes(1);
  });

  it("reports when the connection drops unexpectedly while listening", async () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useLiveVoice({ onError }));
    await startDictation(result);
    const socket = MockWebSocket.instances[0];
    act(() => socket.open());
    expect(result.current.listening).toBe(true);

    act(() => socket.close());

    expect(result.current.listening).toBe(false);
    expect(onError).toHaveBeenCalledWith(
      "Live transcription connection closed unexpectedly — try again."
    );
  });

  it("cancel() abandons dictation without reporting anything", async () => {
    const onFinal = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useLiveVoice({ onFinal, onError }));
    await startDictation(result);
    const socket = MockWebSocket.instances[0];
    act(() => socket.open());
    socket.receive(
      resultsFrame({
        transcript: "hello world",
        words: [word("hello", 0.1, 0.4), word("world", 0.5, 0.9)],
      })
    );

    act(() => result.current.cancel());

    expect(result.current.listening).toBe(false);
    expect(onFinal).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(socket.readyState).toBe(MockWebSocket.CLOSED);
  });

  it("passes the language to the socket URL and hands the mic stream to onStream", async () => {
    const onStream = vi.fn();
    const { result } = renderHook(() => useLiveVoice({ onStream }));
    await startDictation(result, "te");

    expect(mockedGetLiveSocketUrl).toHaveBeenCalledWith("te");
    expect(onStream).toHaveBeenCalledTimes(1);
    expect(onStream.mock.calls[0]?.[0]).toBeDefined();
    expect(MockWebSocket.instances[0].url).toBe("ws://mock/live");
  });
});
