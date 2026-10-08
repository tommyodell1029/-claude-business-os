"use client";
// Jarvis HUD: sign-in, live tiles, voice orb, push-to-talk, transcript and the confirmation card.
// Talks only to /api/jarvis/* (same origin, HttpOnly cookies). No keys, no Supabase client, no third-party calls.
// Everything displayed is rendered as plain React text (escaped); nothing is injected as HTML.
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, PointerEvent as ReactPointerEvent } from "react";
import { parseConfirmation } from "../../lib/jarvis/confirmWords.ts";
import Orb from "./Orb";
import type { OrbState } from "./Orb";

type Line = { id: number; who: "you" | "jarvis" | "system"; text: string };
type Pending = { id: string; tool: string; summary: string; expiresAt: string };
type Tiles = {
  ai_cost_today: number | null;
  opportunities: number | null;
  experiments_active: number | null;
  revenue_month: number | null;
  replies_7d: number | null;
  health: { ok: number; total: number; failing: string[] } | null;
};
type Msg = { role: "user" | "assistant"; content: string };

const UNAVAILABLE = "DATA UNAVAILABLE";
const HOLD_MS = 350;

async function api<T = Record<string, unknown>>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  const r = await fetch(`/api/jarvis/${path}`, { credentials: "same-origin", cache: "no-store", ...init });
  const body = (await r.json().catch(() => ({}))) as T;
  return { status: r.status, body };
}
const postJson = (path: string, data: unknown) =>
  api(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const t of ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"]) if (MediaRecorder.isTypeSupported(t)) return t;
  return "";
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

function Tile({ label, value, alert }: { label: string; value: string | number | null; alert?: boolean }) {
  const missing = value === null;
  return (
    <div className={`jv-tile${alert ? " alert" : ""}${missing ? " na" : ""}`}>
      <span className="jv-tile-label">{label}</span>
      <span className="jv-tile-value">{missing ? UNAVAILABLE : value}</span>
    </div>
  );
}

function SignIn({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await postJson("auth/start", { email });
    setBusy(false);
    setMsg(String(r.body.message ?? r.body.error ?? ""));
    if (r.status === 200) setStep("code");
  };
  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await postJson("auth/verify", { email, code });
    setBusy(false);
    if (r.status === 200) onDone();
    else setMsg(String(r.body.error ?? "Sign-in failed."));
  };

  return (
    <div className="jv-signin">
      <h1>ULTRON</h1>
      <p className="jv-sub">Owner access only.</p>
      {step === "email" ? (
        <form onSubmit={send}>
          <label htmlFor="jv-email">Email</label>
          <input id="jv-email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="jv-btn" disabled={busy}>Send sign-in email</button>
        </form>
      ) : (
        <form onSubmit={verify}>
          <label htmlFor="jv-code">Code from the email</label>
          <input id="jv-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" required value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="jv-btn" disabled={busy}>Sign in</button>
          <button type="button" className="jv-link" onClick={() => setStep("email")}>Use a different email</button>
        </form>
      )}
      {msg ? <p className="jv-msg" role="status">{msg}</p> : null}
      <p className="jv-hint">Opened the link from the email in Safari? You are signed in there. In the installed app, use the code instead.</p>
    </div>
  );
}

export default function Hud() {
  const reducedMotion = useReducedMotion();
  const [auth, setAuth] = useState<"checking" | "signin" | "ready" | "unconfigured">("checking");
  const [tiles, setTiles] = useState<Tiles | null>(null);
  const [orb, setOrb] = useState<OrbState>("idle");
  const [lines, setLines] = useState<Line[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [recording, setRecording] = useState(false);
  const [muted, setMuted] = useState(false);
  const [typed, setTyped] = useState("");

  const history = useRef<Msg[]>([]);
  const lineId = useRef(0);
  const audioCtx = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const levelBuf = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const micSource = useRef<MediaStreamAudioSourceNode | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const pressAt = useRef(0);
  const playing = useRef<AudioBufferSourceNode | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const mutedRef = useRef(false);
  const transcriptEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const say = useCallback((who: Line["who"], text: string) => {
    lineId.current += 1;
    const id = lineId.current;
    setLines((l) => [...l.slice(-60), { id, who, text }]);
  }, []);

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ block: "end", behavior: reducedMotion ? "auto" : "smooth" });
  }, [lines, reducedMotion]);

  // Session check; a magic-link landing first trades the #fragment tokens for HttpOnly cookies.
  const checkSession = useCallback(async () => {
    const r = await api("me");
    setAuth(r.status === 200 ? "ready" : r.status === 503 ? "unconfigured" : "signin");
  }, []);
  useEffect(() => {
    const run = async () => {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      if (hash.get("access_token") && hash.get("refresh_token")) {
        await postJson("auth/session", {
          access_token: hash.get("access_token"),
          refresh_token: hash.get("refresh_token"),
          expires_in: Number(hash.get("expires_in") ?? 3600),
        });
        window.history.replaceState(null, "", window.location.pathname);
      }
      await checkSession();
    };
    void run();
  }, [checkSession]);

  const refreshTiles = useCallback(async () => {
    const r = await api<{ tiles?: Tiles }>("status");
    if (r.status === 401 || r.status === 403) setAuth("signin");
    setTiles(r.body.tiles ?? null);
  }, []);
  useEffect(() => {
    if (auth !== "ready") return;
    const first = setTimeout(() => void refreshTiles(), 0);
    const t = setInterval(() => {
      if (!document.hidden) void refreshTiles();
    }, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [auth, refreshTiles]);

  // Pending-action countdown; the server enforces the same expiry.
  useEffect(() => {
    if (!pending) return;
    const tick = () => {
      const left = Math.max(0, Math.round((Date.parse(pending.expiresAt) - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) setPending(null);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [pending]);

  const level = useCallback((): number => {
    const a = analyser.current, buf = levelBuf.current;
    if (!a || !buf) return 0;
    a.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / buf.length);
  }, []);

  const ensureAudio = useCallback(() => {
    if (!audioCtx.current) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx.current = new Ctx();
      analyser.current = audioCtx.current.createAnalyser();
      analyser.current.fftSize = 512;
      levelBuf.current = new Uint8Array(new ArrayBuffer(analyser.current.fftSize));
    }
    void audioCtx.current.resume();
    return audioCtx.current;
  }, []);

  const stopSpeaking = useCallback(() => {
    try {
      playing.current?.stop();
    } catch {}
    playing.current = null;
  }, []);

  const speak = useCallback(
    async (text: string) => {
      if (mutedRef.current) {
        setOrb("idle");
        return;
      }
      try {
        const r = await fetch("/api/jarvis/tts", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!r.ok) throw new Error(String(r.status));
        const ctx = ensureAudio();
        const buf = await ctx.decodeAudioData(await r.arrayBuffer());
        stopSpeaking();
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.connect(analyser.current!); // level meter only; the analyser has no output, so the mic never reaches the speaker
        playing.current = src;
        setOrb("speaking");
        src.onended = () => {
          src.disconnect();
          if (playing.current === src) playing.current = null;
          setOrb((s) => (s === "speaking" ? "idle" : s));
        };
        src.start();
      } catch {
        say("system", "Voice unavailable; reply shown as text.");
        setOrb("idle");
      }
    },
    [ensureAudio, say, stopSpeaking],
  );

  const confirmAction = useCallback(
    async (decision: "confirm" | "reject", via: "voice" | "tap") => {
      const p = pendingRef.current;
      if (!p) return;
      setPending(null);
      setOrb("thinking");
      const r = await postJson("confirm", { actionId: p.id, decision, via });
      const msg = String(r.body.message ?? r.body.error ?? "Data unavailable.");
      say("jarvis", msg);
      history.current.push({ role: "assistant", content: msg });
      void refreshTiles();
      await speak(msg);
    },
    [refreshTiles, say, speak],
  );

  const ask = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t) return;
      say("you", t);
      // A short, explicit yes/no answers the pending action; anything else is a normal question.
      const decision = pendingRef.current ? parseConfirmation(t) : null;
      if (decision) {
        history.current.push({ role: "user", content: t });
        await confirmAction(decision, "voice");
        return;
      }
      history.current.push({ role: "user", content: t });
      history.current = history.current.slice(-20);
      setOrb("thinking");
      const r = await postJson("chat", { messages: history.current });
      if (r.status === 401 || r.status === 403) {
        setAuth("signin");
        setOrb("idle");
        return;
      }
      const reply = String(r.body.reply ?? r.body.error ?? "Data unavailable.");
      say("jarvis", reply);
      if (r.status === 200) history.current.push({ role: "assistant", content: reply });
      const p = r.body.pending as Pending | null | undefined;
      if (p && typeof p.id === "string") setPending(p);
      await speak(reply);
    },
    [confirmAction, say, speak],
  );

  const startRecording = useCallback(async () => {
    const ctx = ensureAudio();
    stopSpeaking();
    try {
      if (!stream.current || stream.current.getTracks().every((t) => t.readyState === "ended")) {
        stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        micSource.current = ctx.createMediaStreamSource(stream.current);
      }
    } catch {
      say("system", "Microphone permission is needed for voice. You can type instead.");
      return;
    }
    micSource.current?.connect(analyser.current!);
    const mime = pickMime();
    const rec = new MediaRecorder(stream.current, mime ? { mimeType: mime } : undefined);
    chunks.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.current.push(e.data);
    };
    rec.onstop = async () => {
      micSource.current?.disconnect();
      const type = (rec.mimeType || mime || "audio/webm").split(";")[0];
      const blob = new Blob(chunks.current, { type });
      if (blob.size < 1500) {
        setOrb("idle");
        return;
      }
      setOrb("thinking");
      const r = await fetch("/api/jarvis/stt", { method: "POST", credentials: "same-origin", headers: { "content-type": type }, body: blob });
      const j = (await r.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!r.ok || !j.text) {
        say("system", j.error ?? "I didn't catch that.");
        setOrb("idle");
        return;
      }
      await ask(j.text);
    };
    recorder.current = rec;
    rec.start();
    setRecording(true);
    setOrb("listening");
  }, [ask, ensureAudio, say, stopSpeaking]);

  const stopRecording = useCallback(() => {
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
    recorder.current = null;
    setRecording(false);
  }, []);

  // Hold to talk, or tap once to start and tap again to stop.
  const onPressStart = (e: ReactPointerEvent) => {
    e.preventDefault();
    if (recording) {
      stopRecording();
      return;
    }
    pressAt.current = Date.now();
    void startRecording();
  };
  const onPressEnd = (e: ReactPointerEvent) => {
    e.preventDefault();
    if (recording && pressAt.current && Date.now() - pressAt.current > HOLD_MS) stopRecording();
    pressAt.current = 0;
  };

  const signOut = async () => {
    await postJson("auth/logout", {});
    history.current = [];
    setLines([]);
    setPending(null);
    setAuth("signin");
  };

  const health = tiles?.health ? `${tiles.health.ok}/${tiles.health.total} OK` : null;

  return (
    <div className="jv" data-reduced={reducedMotion ? "1" : "0"}>
      <div className="jv-grid" aria-hidden="true" />
      {auth === "checking" ? <p className="jv-center">Initialising…</p> : null}
      {auth === "unconfigured" ? <p className="jv-center">ULTRON is not configured yet. Owner setup steps are in docs/JARVIS_SPEC.md.</p> : null}
      {auth === "signin" ? <SignIn onDone={() => void checkSession()} /> : null}
      {auth === "ready" ? (
        <div className="jv-shell">
          <header className="jv-head">
            <span className="jv-title">U.L.T.R.O.N.</span>
            <span className="jv-head-actions">
              <a className="jv-link" href="/os">Money OS</a>
              <button className="jv-link" onClick={() => setMuted((m) => !m)} aria-pressed={muted}>{muted ? "Voice off" : "Voice on"}</button>
              <button className="jv-link" onClick={() => void signOut()}>Sign out</button>
            </span>
          </header>

          <section className="jv-tiles" aria-label="Live status">
            <Tile label="AI cost today" value={tiles && tiles.ai_cost_today !== null ? `$${tiles.ai_cost_today.toFixed(4)}` : null} />
            <Tile label="Opportunities" value={tiles ? tiles.opportunities : null} />
            <Tile label="Active experiments" value={tiles ? tiles.experiments_active : null} />
            <Tile label="Revenue · this month" value={tiles && tiles.revenue_month !== null ? `$${tiles.revenue_month.toFixed(2)}` : null} />
            <Tile label="Prospect replies · 7 days" value={tiles ? tiles.replies_7d : null} alert={!!tiles?.replies_7d} />
            <Tile label="System health" value={health} alert={!!tiles?.health?.failing.length} />
          </section>

          <section className="jv-core">
            <Orb state={orb} level={level} reducedMotion={reducedMotion} />
            <p className="jv-state" aria-live="polite">{recording ? "Listening…" : orb === "thinking" ? "Thinking…" : orb === "speaking" ? "Speaking" : "Standing by"}</p>
          </section>

          {pending ? (
            <section className="jv-confirm" role="alertdialog" aria-label="Confirm action">
              <p className="jv-confirm-title">Confirmation required · {secondsLeft}s</p>
              <p>{pending.summary}</p>
              <p className="jv-hint">Say “yes” or “no”, or tap.</p>
              <div className="jv-confirm-btns">
                <button className="jv-btn" onClick={() => void confirmAction("confirm", "tap")}>Confirm</button>
                <button className="jv-btn ghost" onClick={() => void confirmAction("reject", "tap")}>Cancel</button>
              </div>
            </section>
          ) : null}

          <section className="jv-transcript" aria-label="Conversation" aria-live="polite">
            {lines.length === 0 ? <p className="jv-hint">Hold the button and speak, or try “Brief me”.</p> : null}
            {lines.map((l) => (
              <p key={l.id} className={`jv-line ${l.who}`}>
                <span className="jv-who">{l.who === "you" ? "YOU" : l.who === "jarvis" ? "ULTRON" : "SYSTEM"}</span>
                {l.text}
              </p>
            ))}
            <div ref={transcriptEnd} />
          </section>

          <footer className="jv-controls">
            <button
              className={`jv-talk${recording ? " on" : ""}`}
              onPointerDown={onPressStart}
              onPointerUp={onPressEnd}
              onPointerCancel={onPressEnd}
              onContextMenu={(e) => e.preventDefault()}
              aria-pressed={recording}
            >
              {recording ? "Release or tap to send" : "Hold to talk"}
            </button>
            <div className="jv-row">
              <button className="jv-btn ghost small" onClick={() => void ask("Brief me, please.")}>Brief me</button>
              <button className="jv-btn ghost small" onClick={() => void ask("Run diagnostics.")}>Diagnostics</button>
            </div>
            <form
              className="jv-type"
              onSubmit={(e) => {
                e.preventDefault();
                const t = typed;
                setTyped("");
                void ask(t);
              }}
            >
              <input aria-label="Type to ULTRON" placeholder="Or type…" maxLength={2000} value={typed} onChange={(e) => setTyped(e.target.value)} />
              <button className="jv-btn small">Send</button>
            </form>
          </footer>
        </div>
      ) : null}
    </div>
  );
}
