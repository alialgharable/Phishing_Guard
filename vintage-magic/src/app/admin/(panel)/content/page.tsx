import type { Metadata } from "next";
import { ActionForm } from "@/components/admin/ActionForm";
import { saveContentAction, setMessageHandledAction } from "@/app/admin/actions";
import { DEFAULT_SITE_CONTENT } from "@/lib/config";
import { getRepository } from "@/lib/data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Store content" };

const TOPIC_LABELS: Record<string, string> = {
  general: "Anything else",
  sizing: "Sizing",
  pickup: "Collection",
  press: "Press",
  atelier: "Reimagining notebook",
};

/**
 * Store content and enquiries. Contact channels are never invented by the site: an empty field here
 * means the corresponding link simply does not exist on the shop front.
 */
export default async function AdminContentPage() {
  const repository = getRepository();
  const [content, messages] = await Promise.all([repository.getSiteContent(), repository.listMessages()]);
  const unread = messages.filter((message) => !message.handled);

  return (
    <div className="grid gap-8 lg:grid-cols-12">
      <section className="lg:col-span-7" aria-labelledby="content-heading">
        <p className="label text-ink/55">Shown on the About, Contact and footer blocks</p>
        <h1 id="content-heading" className="font-editorial text-[clamp(1.8rem,3.6vw,2.6rem)] leading-none">
          Store content
        </h1>

        <ActionForm action={saveContentAction} submitLabel="Save content" resetOnSuccess={false} className="mt-5 flex flex-col gap-5">
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-[0.8rem] uppercase tracking-[0.14em] text-ink/55">Contact channels — leave empty to hide</legend>
            <TextField name="email" label="Email" value={content.email} />
            <TextField name="phone" label="Phone" value={content.phone} />
            <TextField name="whatsapp" label="WhatsApp" value={content.whatsapp} />
            <TextField name="instagram" label="Instagram handle" value={content.instagram} />
            <TextField name="addressLine" label="Address line" value={content.addressLine} />
            <TextField name="hours" label="Hours" value={content.hours} />
          </fieldset>

          <fieldset className="grid gap-4 border-t border-ink/15 pt-4">
            <legend className="sr-only">House note</legend>
            <TextField name="aboutHeading" label="About heading" value={content.aboutHeading} />
            <label className="block">
              <span className="field-label">House note — one paragraph per blank line</span>
              <textarea name="aboutParagraphs" rows={12} className="field mt-1.5 resize-y font-mono text-[0.85rem]" defaultValue={content.aboutParagraphs.join("\n\n")} />
            </label>
          </fieldset>

          <fieldset className="grid gap-4 border-t border-ink/15 pt-4">
            <legend className="sr-only">Studio note</legend>
            <label className="inline-flex cursor-pointer items-center gap-2 text-[0.92rem]">
              <input type="checkbox" name="atelierTeaserEnabled" defaultChecked={content.atelierTeaserEnabled} className="h-4 w-4 accent-[var(--color-ink)]" />
              Show the reimagining teaser on the home page
            </label>
            <label className="block">
              <span className="field-label">Teaser copy — it must stay a note, not a promise of service</span>
              <textarea name="atelierTeaserCopy" rows={3} className="field mt-1.5 resize-y" defaultValue={content.atelierTeaserCopy} />
            </label>
          </fieldset>

          <p className="text-[0.86rem] leading-snug text-ink/55">
            Saved into the store’s own record (the <code className="label">site_content</code> row), which starts from these defaults:{" "}
            {DEFAULT_SITE_CONTENT.aboutParagraphs.length} paragraphs of house note and no contact channels until you type them.
          </p>
        </ActionForm>
      </section>

      <section className="lg:col-span-5" aria-labelledby="messages-heading">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="messages-heading" className="font-editorial text-[1.5rem] leading-none">
            Enquiries
          </h2>
          <span className="label text-ink/55">
            {unread.length} unread / {messages.length} total
          </span>
        </div>

        {messages.length === 0 ? (
          <p className="mt-3 border border-dashed border-ink/25 p-5 text-[0.94rem] text-ink/65">
            Nothing has arrived through the contact form yet. The form is live and writes here — no messages are simulated for display.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {messages.slice(0, 12).map((message) => (
              <li key={message.id} className={["border p-3", message.handled ? "border-ink/15 bg-chalk/30" : "border-ink/30 bg-chalk/70"].join(" ")}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="font-editorial text-[1.15rem] leading-tight">{message.name}</p>
                  <span className="label text-ink/55">
                    {TOPIC_LABELS[message.topic] ?? message.topic} ·{" "}
                    {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(message.createdAt))}
                  </span>
                </div>
                <p className="mt-1.5 text-[0.93rem] leading-snug">
                  {message.body}
                </p>
                <p className="mt-2 text-[0.88rem] text-ink/60">
                  {message.email ? <a href={`mailto:${message.email}`} className="underline underline-offset-2">{message.email}</a> : null}
                  {message.email && message.phone ? " · " : null}
                  {message.phone ? <a href={`tel:${message.phone.replace(/[^+\d]/g, "")}`} className="underline underline-offset-2">{message.phone}</a> : null}
                  {!message.email && !message.phone ? "No reply channel given." : null}
                </p>
                <ActionForm
                  action={setMessageHandledAction}
                  submitLabel={message.handled ? "Mark unread" : "Mark handled"}
                  hidden={{ id: message.id }}
                  className="mt-2 flex items-center gap-3"
                  resetOnSuccess={false}
                >
                  <label className="inline-flex items-center gap-2 text-[0.85rem]">
                    <input type="checkbox" name="handled" defaultChecked={message.handled} className="h-3.5 w-3.5 accent-[var(--color-ink)]" />
                    handled
                  </label>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function TextField({ name, label, value }: { name: string; label: string; value: string | null }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input name={name} className="field mt-1.5" defaultValue={value ?? ""} placeholder="leave empty to hide" />
    </label>
  );
}
