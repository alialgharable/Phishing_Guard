"use client";

import { useTransition, useState } from "react";
import type { ActionOutcome } from "@/app/admin/actions";

/**
 * Small wrapper that lets a plain server action drive a form: it submits through `FormData`,
 * reports the outcome in an ARIA live region, and keeps working as a normal POST if the action call
 * itself fails. No optimistic success anywhere - the message is whatever the server returned.
 */

export interface ActionFormProps {
  action: (formData: FormData) => Promise<ActionOutcome>;
  submitLabel: string;
  children?: React.ReactNode;
  className?: string;
  confirm?: string;
  hidden?: Record<string, string | number>;
  resetOnSuccess?: boolean;
}

export function ActionForm({ action, submitLabel, children, className, confirm, hidden, resetOnSuccess = true }: ActionFormProps) {
  const [outcome, setOutcome] = useState<ActionOutcome | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (confirm && !window.confirm(confirm)) return;
    const element = event.currentTarget;
    const data = new FormData(element);
    startTransition(async () => {
      try {
        const result = await action(data);
        setOutcome(result);
        if (result.ok && resetOnSuccess) element.reset();
      } catch (error) {
        setOutcome({ ok: false, error: error instanceof Error ? error.message : "The server did not answer." });
      }
    });
  };

  return (
    <form onSubmit={submit} className={className}>
      {hidden
        ? Object.entries(hidden).map(([key, value]) => <input key={key} type="hidden" name={key} value={String(value)} />)
        : null}
      {children}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-sm border border-ink bg-ink px-3 py-1.5 text-[0.82rem] font-semibold uppercase tracking-[0.1em] text-chalk transition-opacity disabled:opacity-50">
          {pending ? "Saving…" : submitLabel}
        </button>
        <span aria-live="polite" className={["text-[0.86rem]", outcome?.ok ? "text-olive" : outcome ? "text-burgundy" : "text-ink/50"].filter(Boolean).join(" ")}>
          {outcome ? (outcome.ok ? outcome.message ?? "Saved." : outcome.error) : null}
        </span>
      </div>
    </form>
  );
}

/** Same contract without a form element - used by the product editor, which drives its own submit. */
export function useActionRunner(action: (formData: FormData) => Promise<ActionOutcome>) {
  const [outcome, setOutcome] = useState<ActionOutcome | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (data: FormData) =>
    new Promise<ActionOutcome>((resolve) => {
      startTransition(async () => {
        try {
          const result = await action(data);
          setOutcome(result);
          resolve(result);
        } catch (error) {
          const result: ActionOutcome = { ok: false, error: error instanceof Error ? error.message : "The server did not answer." };
          setOutcome(result);
          resolve(result);
        }
      });
    });
  return { outcome, pending, run, setOutcome };
}
