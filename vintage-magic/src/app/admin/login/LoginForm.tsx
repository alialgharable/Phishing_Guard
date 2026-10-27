"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { signInAction } from "@/app/admin/actions";

/**
 * Password form. The failure message is generic about the password and specific about the
 * configuration, because the configuration is the part an operator can actually fix.
 */
export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await signInAction(data);
      if (result.ok) {
        router.replace("/admin");
        router.refresh();
        return;
      }
      setError(result.error);
    });
  };

  return (
    <form onSubmit={submit} className="mt-6 border border-ink/20 bg-chalk/50 p-5">
      <label htmlFor="admin-password" className="field-label">
        Shop password
      </label>
      <input id="admin-password" name="password" type="password" autoComplete="current-password" className="field mt-1.5" required />
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className="btn btn--solid">
          <span>{pending ? "Checking…" : "Sign in"}</span>
          <span aria-hidden>→</span>
        </button>
        <span className="text-[0.9rem] text-ink/55">Sessions last eight hours.</span>
      </div>
      {error ? (
        <p role="alert" className="mt-4 border-l-2 border-burgundy pl-3 text-[0.95rem] text-burgundy">
          {error}
        </p>
      ) : null}
    </form>
  );
}
