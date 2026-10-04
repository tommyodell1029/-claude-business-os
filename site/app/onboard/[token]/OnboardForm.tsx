"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";

const DAYS = [["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"]] as const;
const FAQ_ROWS = 5;
type State = { kind: "idle" } | { kind: "sending" } | { kind: "done" } | { kind: "error"; message: string; fields: Record<string, string> };

export default function OnboardForm({ consentText, spanish }: { consentText: string; spanish: boolean }) {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<State>({ kind: "idle" });
  const [closed, setClosed] = useState<Record<string, boolean>>({ sat: true, sun: true });
  const [es, setEs] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "");
    const hours = Object.fromEntries(DAYS.map(([d]) => [d, closed[d] ? "closed" : `${get(`${d}_open`)}-${get(`${d}_close`)}`]));
    const faqs = Array.from({ length: FAQ_ROWS }, (_, i) => ({ q: get(`faq_q_${i}`), a: get(`faq_a_${i}`) }));
    setState({ kind: "sending" });
    try {
      const r = await fetch(`/api/onboard/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          business_name: get("business_name"), industry: get("industry"), address: get("address"), service_area: get("service_area"),
          hours, services: get("services"), faqs, owner_name: get("owner_name"), owner_phone: get("owner_phone"),
          owner_email: get("owner_email"), handoff_number: get("handoff_number"), emergency_keywords: get("emergency_keywords"),
          greeting: get("greeting"), languages: es ? ["en", "es"] : ["en"], greeting_es: get("greeting_es"), never_say: get("never_say"),
          website: get("website"), consent: f.get("consent") === "on",
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
        <strong>Thank you, we have your answers.</strong> We will set up your receptionist and contact you to do a test call together.
      </div>
    );
  }
  const fe = state.kind === "error" ? state.fields : {};
  const field = (id: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, hint?: string) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={id} aria-invalid={!!fe[id]} {...props} />
      {hint ? <p className="hint">{hint}</p> : null}
      {fe[id] ? <p className="err">{fe[id]}</p> : null}
    </div>
  );
  const area = (id: string, label: string, hint: string, rows = 3) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} name={id} rows={rows} aria-invalid={!!fe[id]} />
      <p className="hint">{hint}</p>
      {fe[id] ? <p className="err">{fe[id]}</p> : null}
    </div>
  );
  return (
    <form onSubmit={onSubmit} noValidate className="form">
      <h2>Your business</h2>
      {field("business_name", "Business name", { required: true, maxLength: 150, autoComplete: "organization" })}
      {field("industry", "What kind of business is it?", { required: true, maxLength: 150 }, "For example: plumbing, HVAC, dental office, landscaping.")}
      {field("address", "Business address", { required: true, maxLength: 300, autoComplete: "street-address" })}
      {area("service_area", "Where do you work?", "Cities or neighborhoods you serve, one per line.")}
      {area("services", "What do you do?", "The services you want the receptionist to talk about, one per line.", 4)}

      <h2>Hours</h2>
      <p className="hint">When your business is open. Outside these hours the receptionist still answers and takes a message.</p>
      {DAYS.map(([d, label]) => (
        <div className="field" key={d}>
          <label htmlFor={`${d}_open`}>{label}</label>
          <div className="row2">
            <input id={`${d}_open`} name={`${d}_open`} type="time" defaultValue="08:00" disabled={closed[d]} aria-label={`${label} opens`} />
            <input id={`${d}_close`} name={`${d}_close`} type="time" defaultValue="17:00" disabled={closed[d]} aria-label={`${label} closes`} />
          </div>
          <div className="consent">
            <input id={`${d}_closed`} type="checkbox" checked={!!closed[d]} onChange={(e) => setClosed({ ...closed, [d]: e.target.checked })} />
            <label htmlFor={`${d}_closed`}>Closed</label>
          </div>
          {fe[`hours_${d}`] ? <p className="err">{fe[`hours_${d}`]}</p> : null}
        </div>
      ))}

      <h2>Common questions</h2>
      <p className="hint">
        Questions callers often ask, with the exact answer you approve. The receptionist will not make up answers or quote prices you do not give here.
      </p>
      {Array.from({ length: FAQ_ROWS }, (_, i) => (
        <div className="field" key={i}>
          <label htmlFor={`faq_q_${i}`}>Question {i + 1} <span className="opt">(optional)</span></label>
          <input id={`faq_q_${i}`} name={`faq_q_${i}`} maxLength={200} />
          <label htmlFor={`faq_a_${i}`}>Approved answer</label>
          <textarea id={`faq_a_${i}`} name={`faq_a_${i}`} rows={2} maxLength={600} />
        </div>
      ))}
      {fe.faqs ? <p className="err">{fe.faqs}</p> : null}

      <h2>You and your alerts</h2>
      {field("owner_name", "Owner's name", { required: true, maxLength: 100, autoComplete: "name" })}
      <div className="row2">
        {field("owner_phone", "Owner's cell", { type: "tel", required: true, maxLength: 20, autoComplete: "tel" }, "Used for urgent alerts.")}
        {field("owner_email", "Owner's email", { type: "email", required: true, maxLength: 254, autoComplete: "email" }, "We email a summary of every call here.")}
      </div>

      <h2>Emergencies</h2>
      {field("handoff_number", "Emergency handoff number", { type: "tel", required: true, maxLength: 20 }, "The receptionist rings this number for a real emergency. It can be your cell.")}
      {area("emergency_keywords", "What counts as an emergency?", "Words or phrases a caller might say, one per line. For example: burst pipe, gas smell, no heat.", 4)}

      <h2>How it sounds</h2>
      {field("greeting", "Greeting", { required: true, maxLength: 200, defaultValue: "How can I help you today?" },
        "Spoken right after the required line \"Thanks for calling [your business], I'm their AI assistant. This call may be recorded.\" That line cannot be removed.")}
      {spanish ? (
        <>
          <div className="consent">
            <input id="es" type="checkbox" checked={es} onChange={(e) => setEs(e.target.checked)} />
            <label htmlFor="es">Answer callers in English and Spanish</label>
          </div>
          {fe.languages ? <p className="err">{fe.languages}</p> : null}
          {es ? field("greeting_es", "Greeting in Spanish", { maxLength: 200 }, "Also add Spanish emergency phrases above (for example: fuga de gas, inundación).") : null}
        </>
      ) : null}
      {area("never_say", "Anything the receptionist must never say?", "One per line, for example: never promise a same-day visit; never mention a competitor. Optional.", 3)}

      <div className="hp" aria-hidden="true">
        <label htmlFor="website">Leave this empty</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="consent">
        <input id="consent" name="consent" type="checkbox" required aria-invalid={!!fe.consent} />
        <label htmlFor="consent">{consentText}</label>
      </div>
      {fe.consent ? <p className="err">{fe.consent}</p> : null}
      {fe.form ? <p className="err" role="alert">{fe.form}</p> : null}
      {state.kind === "error" && !Object.keys(fe).length ? <p className="err" role="alert">{state.message}</p> : null}
      <button className="btn" type="submit" disabled={state.kind === "sending"}>
        {state.kind === "sending" ? "Sending…" : "Submit my answers"}
      </button>
    </form>
  );
}
