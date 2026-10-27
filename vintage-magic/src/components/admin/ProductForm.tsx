"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { saveProductAction, uploadImageAction } from "@/app/admin/actions";
import { CATEGORIES, CATEGORY_LABELS, DIAGRAMS, DIAGRAM_LABELS, GENDERS, GENDER_LABELS, type DiagramId, type ProductImage } from "@/lib/types";

/**
 * The product editor. Prices are typed the way a person thinks about them ("120.50") and converted to
 * cents on the server; images are either uploaded (the server writes them to Storage or to
 * `public/media/uploads` and hands back the path) or pointed at a path that already exists, which is
 * what keeps the shipped example stock editable without an upload backend.
 */

export interface ProductFormValues {
  id?: string;
  name: string;
  slug: string;
  era: string;
  categories: string[];
  genders: string[];
  sizeLabel: string;
  price: string;
  quantity: number;
  condition: string;
  description: string;
  provenance: string;
  diagram: DiagramId | "";
  featured: boolean;
  archived: boolean;
  measurements: Array<{ label: string; value: string }>;
  images: ProductImage[];
}

export function ProductForm({ initial }: { initial: ProductFormValues }) {
  const router = useRouter();
  const [values, setValues] = useState<ProductFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [saving, startSaving] = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const set = <K extends keyof ProductFormValues>(key: K) => (value: ProductFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const field = String(key);
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const toggleIn = (key: "categories" | "genders", option: string) =>
    setValues((current) => {
      const has = current[key].includes(option);
      const next = has ? current[key].filter((entry) => entry !== option) : [...current[key], option];
      return { ...current, [key]: key === "categories" ? (next.length > 0 ? next : current[key]) : next.length > 0 ? next : ["unisex"] };
    });

  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);
    startSaving(async () => {
      const result = await saveProductAction({
        id: values.id,
        name: values.name,
        slug: values.slug,
        era: values.era,
        categories: values.categories,
        genders: values.genders,
        sizeLabel: values.sizeLabel,
        price: values.price,
        quantity: values.quantity,
        condition: values.condition,
        description: values.description,
        provenance: values.provenance,
        diagram: values.diagram,
        featured: values.featured,
        archived: values.archived,
        measurements: values.measurements.filter((row) => row.label.trim() !== "" && row.value.trim() !== ""),
        images: values.images.filter((image) => image.src.trim() !== ""),
      });
      if (!result.ok) {
        setErrors(result.errors ?? {});
        setNotice({ tone: "error", text: result.error });
        return;
      }
      setNotice({ tone: "ok", text: result.isNew ? `Saved. ${values.name} is now in the archive.` : "Saved. The public page has been updated." });
      setValues((current) => ({ ...current, id: result.id, slug: result.slug }));
      router.refresh();
    });
  };

  const upload = async (file: File) => {
    setUploading(true);
    setNotice(null);
    const data = new FormData();
    data.append("file", file);
    data.append("alt", `${values.name || "Piece"} — ${file.name}`);
    const result = await uploadImageAction(data);
    setUploading(false);
    if (!result.ok) {
      setNotice({ tone: "error", text: result.error });
      return;
    }
    setValues((current) => ({ ...current, images: [...current.images, result.image] }));
    setNotice({ tone: "ok", text: `Image stored at ${result.image.src}` });
    if (fileInput.current) fileInput.current.value = "";
  };

  const moveImage = (index: number, direction: -1 | 1) =>
    setValues((current) => {
      const next = [...current.images];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      const [entry] = next.splice(index, 1);
      next.splice(target, 0, entry!);
      return { ...current, images: next };
    });

  return (
    <form onSubmit={save} className="flex flex-col gap-7">
      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" error={errors.name} required>
          <input className="field" value={values.name} onChange={(event) => set("name")(event.target.value)} name="name" required />
        </Field>
        <Field label="Address (slug)" hint="leave empty to generate from the name" error={errors.slug}>
          <input className="field" value={values.slug} onChange={(event) => set("slug")(event.target.value)} name="slug" placeholder={values.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")} />
        </Field>
        <Field label="Era" hint="only what you actually know: 1970s, 1994, unknown">
          <input className="field" value={values.era} onChange={(event) => set("era")(event.target.value)} name="era" />
        </Field>
        <Field label="Price (USD)" error={errors.price} required>
          <input className="field" value={values.price} onChange={(event) => set("price")(event.target.value)} name="price" inputMode="decimal" placeholder="120.50" />
        </Field>
        <Field label="How many the shop can still sell" hint="0 marks the piece as collected" error={errors.quantity}>
          <input className="field" type="number" min={0} max={999} step={1} value={values.quantity} onChange={(event) => set("quantity")(Number.parseInt(event.target.value, 10) || 0)} name="quantity" />
        </Field>
        <Field label="Label size" hint="as the garment is tagged">
          <input className="field" value={values.sizeLabel} onChange={(event) => set("sizeLabel")(event.target.value)} name="sizeLabel" placeholder="M / 38 / one size" />
        </Field>
      </section>

      <fieldset className="grid gap-5 sm:grid-cols-2">
        <div>
          <legend className="field-label">Categories *</legend>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {CATEGORIES.map((category) => (
              <Check key={category} label={CATEGORY_LABELS[category]} checked={values.categories.includes(category)} onChange={() => toggleIn("categories", category)} />
            ))}
          </div>
          {errors.categories ? <p className="mt-1.5 text-[0.88rem] text-burgundy">{errors.categories}</p> : null}
        </div>
        <div>
          <legend className="field-label">Cut for</legend>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {GENDERS.map((gender) => (
              <Check key={gender} label={GENDER_LABELS[gender]} checked={values.genders.includes(gender)} onChange={() => toggleIn("genders", gender)} />
            ))}
          </div>
        </div>
      </fieldset>

      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="Condition" hint="what is wrong with it, plainly">
          <textarea className="field resize-y" rows={3} value={values.condition} onChange={(event) => set("condition")(event.target.value)} name="condition" />
        </Field>
        <Field label="Description">
          <textarea className="field resize-y" rows={3} value={values.description} onChange={(event) => set("description")(event.target.value)} name="description" />
        </Field>
        <Field label="Provenance" hint="who it came from, if the seller said">
          <textarea className="field resize-y" rows={2} value={values.provenance} onChange={(event) => set("provenance")(event.target.value)} name="provenance" />
        </Field>
        <Field label="Cut diagram" hint="drawn plate shown when there is no photo, and as a gallery plate">
          <select className="field" value={values.diagram} onChange={(event) => set("diagram")(event.target.value as DiagramId | "")} name="diagram">
            <option value="">None</option>
            {DIAGRAMS.map((diagram) => (
              <option key={diagram} value={diagram}>
                {DIAGRAM_LABELS[diagram]}
              </option>
            ))}
          </select>
        </Field>
      </section>

      <section>
        <div className="flex items-center justify-between gap-4">
          <h2 className="label text-ink/55">Measurements (flat)</h2>
          <button type="button" className="label underline underline-offset-4" onClick={() => set("measurements")([...values.measurements, { label: "", value: "" }])}>
            Add a row
          </button>
        </div>
        <div className="mt-2 flex flex-col gap-2">
          {values.measurements.length === 0 ? <p className="text-[0.9rem] text-ink/55">None yet. Chest, shoulder, sleeve and length are the four the shop records most.</p> : null}
          {values.measurements.map((row, index) => (
            <div key={index} className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-2">
              <input className="field" value={row.label} placeholder="Chest" onChange={(event) => set("measurements")(values.measurements.map((entry, i) => (i === index ? { ...entry, label: event.target.value } : entry)))} />
              <input className="field" value={row.value} placeholder="52 cm" onChange={(event) => set("measurements")(values.measurements.map((entry, i) => (i === index ? { ...entry, value: event.target.value } : entry)))} />
              <button type="button" className="label px-2 py-1" onClick={() => set("measurements")(values.measurements.filter((_, i) => i !== index))} aria-label={`Remove measurement row ${index + 1}`}>
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="label text-ink/55">Images ({values.images.length})</h2>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="text-[0.85rem]"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <button type="button" className="label underline underline-offset-4" onClick={() => set("images")([...values.images, { src: "", alt: "" }])}>
              Add by path or URL
            </button>
          </div>
        </div>
        <p className="mt-1 text-[0.86rem] leading-snug text-ink/55">
          {uploading
            ? "Uploading…"
            : "Uploads are written by the server to the configured backend — Supabase Storage when it is set, otherwise public/media/uploads. Max 6 MB, JPEG/PNG/WebP. A path like /media/hero-coat.jpg points at a file already in public/media."}
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {values.images.map((image, index) => (
            <li key={index} className="grid grid-cols-[3.2rem_1fr_1fr_auto] items-center gap-2">
              <span className="photo-plate grid aspect-[4/5] place-items-center overflow-hidden">
                {image.src ? (
                  <img src={image.src} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="label text-ink/40">—</span>
                )}
              </span>
              <input className="field" value={image.src} placeholder="/media/uploads/file.jpg or https://…" onChange={(event) => set("images")(values.images.map((entry, i) => (i === index ? { ...entry, src: event.target.value } : entry)))} />
              <input className="field" value={image.alt} placeholder="Alt text: what a photo of this looks like" onChange={(event) => set("images")(values.images.map((entry, i) => (i === index ? { ...entry, alt: event.target.value } : entry)))} />
              <span className="flex gap-1">
                <button type="button" className="label px-1" onClick={() => moveImage(index, -1)} aria-label="Move earlier">
                  ↑
                </button>
                <button type="button" className="label px-1" onClick={() => moveImage(index, 1)} aria-label="Move later">
                  ↓
                </button>
                <button type="button" className="label px-1 text-burgundy" onClick={() => set("images")(values.images.filter((_, i) => i !== index))} aria-label="Remove image">
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <fieldset className="flex flex-wrap gap-6 border-t border-ink/15 pt-4">
        <Check label="Featured on the cover" checked={values.featured} onChange={(checked) => set("featured")(checked)} name="featured" />
        <Check label="Archived (hidden from the public archive)" checked={values.archived} onChange={(checked) => set("archived")(checked)} name="archived" />
      </fieldset>

      {notice ? (
        <p role={notice.tone === "error" ? "alert" : "status"} className={["border-l-2 pl-3 text-[0.95rem]", notice.tone === "error" ? "border-burgundy text-burgundy" : "border-olive text-olive"].join(" ")}>
          {notice.text}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-ink/15 pt-4">
        <button type="submit" disabled={saving || uploading} className="btn btn--solid">
          <span>{saving ? "Writing to the store…" : values.id ? "Save changes" : "Add to the archive"}</span>
        </button>
        {values.id ? (
          <Link href={`/archive/${values.slug || "piece"}`} className="label underline underline-offset-4" target="_blank">
            View public page
          </Link>
        ) : null}
        <Link href="/admin/products" className="label underline underline-offset-4 text-ink/60">
          Back to products
        </Link>
      </div>
    </form>
  );
}

function Field({ label, hint, error, required, children }: { label: string; hint?: string; error?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="field-label flex flex-wrap items-baseline gap-2">
        <span>
          {label}
          {required ? <span className="text-burgundy"> *</span> : null}
        </span>
        {hint ? <span className="normal-case tracking-normal text-ink/45">{hint}</span> : null}
      </span>
      <span className="mt-1.5 block">{children}</span>
      {error ? <span className="mt-1.5 block text-[0.88rem] text-burgundy">{error}</span> : null}
    </label>
  );
}

function Check({ label, checked, onChange, name }: { label: string; checked: boolean; onChange: (checked: boolean) => void; name?: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-ink/20 px-3 py-1.5 text-[0.9rem] transition-colors hover:border-ink" style={checked ? { borderColor: "var(--color-ink)", background: "color-mix(in srgb, var(--color-ink) 8%, transparent)" } : undefined}>
      <input
        type="checkbox"
        name={name}
        className="h-3.5 w-3.5 accent-[var(--color-ink)]"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}
