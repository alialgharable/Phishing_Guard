"use client";

import { useState } from "react";
import Link from "next/link";
import { validateContact } from "@/lib/validation";

/**
 * Enquiry form. The field rules are the same `validateContact` the API runs, so a message that
 * passes here and fails there is a bug rather than a surprise. Submitting posts to the shop's own
 * endpoint; the success panel is only shown when the server actually stored the message.
 */

const TOPICS = [
  { value: "general", label: "Anything else" },
  { value: "sizing", label: "Sizing & measurements" },
  { value: "pickup", label: "Collection & delivery" },
  { value: "press", label: "Press" },
  { value: "atelier", label: "The reimagining notebook" },
] as const;

const FIELDS = {
  name: "",
  email: "",
  phone: "",
  topic: "general",
  body: "",
} as const;

type FieldName = keyof typeof FIELDS;

export function ContactForm({ defaultTopic }: { defaultTopic?: string }) {
  const [values, setValues] = useState<Record<FieldName, string>>({ ...FIELDS, topic: TOPICS.some((t) => t.value === defaultTopic) ? (defaultTopic as string) : "general" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [reference, setReference] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const set = (field: FieldName) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const checked = validateContact(values);
    if (Object.keys(checked.errors).length > 0) {
      setErrors(checked.errors);
      focusFirst(checked.errors);
      return;
    }
    setErrors({});
    setState("sending");
    setServerError(null);
    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; reference?: string; errors?: Record<string, string>; error?: string } | null;
      if (!response.ok || !payload?.ok) {
        setErrors(payload?.errors ?? {});
        setServerError(payload?.error ?? "The shop's message store did not answer. Try again in a moment.");
        setState("failed");
        focusFirst(payload?.errors ?? {});
        return;
      }
      setReference(payload.reference ?? null);
      setState("sent");
    } catch {
      setServerError("No connection to the shop's server. Nothing was lost — the text is still in the box.");
      setState("failed");
    }
  };

  if (state === "sent") {
    return (
      <div className="border border-ink/25 bg-chalk/60 p-6" role="status">
        <p className="label text-olive">Message stored</p>
        <h3 className="display mt-2 text-[clamp(1.8rem,3.4vw,2.6rem)]">It is in the shop’s queue</h3>
        <p className="mt-3 max-w-[44ch] text-[0.98rem] leading-snug text-ink/72">
          {reference ? (
            <>
              Reference <span className="label">{reference}</span>. Replies go back through whichever channel you left — there is no auto-responder, a person answers.
            </>
          ) : (
            "Replies go back through whichever channel you left — there is no auto-responder, a person answers."
          )}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setValues({ ...FIELDS, topic: "general" });
              setState("idle");
              setReference(null);
            }}
          >
            <span>Write another</span>
          </button>
          <Link href="/archive" className="btn btn--solid">
            <span>Back to the archive</span>
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5" aria-describedby="contact-form-note">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="contact-name" label="Your name" error={errors.name} required>
          <input id="contact-name" name="name" className="field" value={values.name} onChange={set("name")} autoComplete="name" aria-invalid={Boolean(errors.name)} />
        </Field>
        <Field id="contact-phone" label="Phone" hint="Optional, but the fastest way back to you" error={errors.phone}>
          <input id="contact-phone" name="phone" className="field" value={values.phone} onChange={set("phone")} inputMode="tel" autoComplete="tel" aria-invalid={Boolean(errors.phone)} />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="contact-email" label="Email" hint="Either this or a phone number" error={errors.email}>
          <input id="contact-email" name="email" type="email" className="field" value={values.email} onChange={set("email")} autoComplete="email" aria-invalid={Boolean(errors.email)} />
        </Field>
        <Field id="contact-topic" label="About">
          <select id="contact-topic" name="topic" className="field" value={values.topic} onChange={set("topic")}>
            {TOPICS.map((topic) => (
              <option key={topic.value} value={topic.value}>
                {topic.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field id="contact-body" label="Message" error={errors.body} required>
        <textarea id="contact-body" name="body" rows={5} className="field resize-y" value={values.body} onChange={set("body")} aria-invalid={Boolean(errors.body)} />
      </Field>

      <p id="contact-form-note" className="text-[0.9rem] leading-snug text-ink/60">
        This form writes to the shop’s own record — no third-party inbox, no newsletter, nothing is sent anywhere else.
      </p>

      {serverError ? (
        <p role="alert" className="border border-burgundy/45 bg-burgundy/8 px-3 py-2 text-[0.95rem] text-burgundy">
          {serverError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className="btn btn--solid" disabled={state === "sending"}>
          <span>{state === "sending" ? "Sending…" : "Send to the shop"}</span>
          <span aria-hidden>{state === "sending" ? "" : "→"}</span>
        </button>
        <span className="label text-ink/45">{values.body.trim().length} characters</span>
      </div>
    </form>
  );
}

function Field({ id, label, hint, error, required, children }: { id: string; label: string; hint?: string; error?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="field-label flex items-baseline gap-2">
        <span>
          {label}
          {required ? <span className="text-burgundy"> *</span> : null}
        </span>
        {hint ? <span className="normal-case tracking-normal text-ink/45">{hint}</span> : null}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p className="mt-1.5 text-[0.9rem] text-burgundy" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function focusFirst(errors: Record<string, string>) {
  const first = Object.keys(errors)[0];
  if (!first) return;
  const element = document.getElementById(`contact-${first}`);
  element?.focus();
}
