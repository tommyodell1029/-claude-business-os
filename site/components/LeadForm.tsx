"use client";
import { useState } from "react";
import type { FormEvent } from "react";

type State = { kind: "idle" } | { kind: "sending" } | { kind: "done" } | { kind: "error"; message: string; fields: Record<string, string> };

export default function LeadForm({ consentText }: { consentText: string }) {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState({ kind: "sending" });
    try {
      const r = await fetch("/api/lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: f.get("name"),
          email: f.get("email"),
          phone: f.get("phone"),
          business: f.get("business"),
          message: f.get("message"),
          website: f.get("website"),
          consent: f.get("consent") === "on",
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.ok) return setState({ kind: "done" });
      setState({ kind: "error", message: data.error ?? "Please fix the highlighted fields.", fields: data.errors ?? {} });
    } catch {
      setState({ kind: "error", message: "Could not send. Check your connection and try again.", fields: {} });
    }
  }

  if (state.kind === "done") {
    return (
      <div className="notice ok" role="status">
        <strong>Thanks, we got your message.</strong> We will reach out by email or phone as soon as we can.
      </div>
    );
  }
  const fe = state.kind === "error" ? state.fields : {};
  return (
    <form onSubmit={onSubmit} noValidate className="form">
      <div className="field">
        <label htmlFor="name">Your name</label>
        <input id="name" name="name" autoComplete="name" required maxLength={100} aria-invalid={!!fe.name} />
        {fe.name ? <p className="err">{fe.name}</p> : null}
      </div>
      <div className="row2">
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" maxLength={254} aria-invalid={!!fe.email} />
          {fe.email ? <p className="err">{fe.email}</p> : null}
        </div>
        <div className="field">
          <label htmlFor="phone">Phone</label>
          <input id="phone" name="phone" type="tel" autoComplete="tel" maxLength={20} aria-invalid={!!fe.phone} />
          {fe.phone ? <p className="err">{fe.phone}</p> : null}
        </div>
      </div>
      <p className="hint">Email or phone, at least one.</p>
      {fe.contact ? <p className="err">{fe.contact}</p> : null}
      <div className="field">
        <label htmlFor="business">Business name <span className="opt">(optional)</span></label>
        <input id="business" name="business" autoComplete="organization" maxLength={150} />
      </div>
      <div className="field">
        <label htmlFor="message">How can we help? <span className="opt">(optional)</span></label>
        <textarea id="message" name="message" rows={4} maxLength={2000} />
      </div>
      {/* Honeypot: hidden from people and assistive tech; bots fill it. */}
      <div className="hp" aria-hidden="true">
        <label htmlFor="website">Leave this empty</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="consent">
        <input id="consent" name="consent" type="checkbox" required aria-invalid={!!fe.consent} />
        <label htmlFor="consent">{consentText}</label>
      </div>
      {fe.consent ? <p className="err">{fe.consent}</p> : null}
      {state.kind === "error" && !Object.keys(fe).length ? <p className="err" role="alert">{state.message}</p> : null}
      <button className="btn" type="submit" disabled={state.kind === "sending"}>
        {state.kind === "sending" ? "Sending…" : "Send"}
      </button>
    </form>
  );
}
