import { NextResponse } from "next/server";
import { getRepository } from "@/lib/data";
import { validateContact } from "@/lib/validation";
import type { ContactMessage } from "@/lib/types";

export const dynamic = "force-dynamic";

const TOPICS: ContactMessage["topic"][] = ["general", "sizing", "pickup", "press", "atelier"];

/**
 * Stores an enquiry. The same `validateContact` the form runs is re-run here - the browser is never
 * trusted - and any extra field is dropped rather than stored. If persistence fails the response is
 * a clear 500 instead of a fake success.
 */
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "The message could not be read." }, { status: 400 });
  }

  const body = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
  const { value, errors } = validateContact(body);
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ errors, error: "Some fields need another look." }, { status: 422 });
  }
  if (!TOPICS.includes(value.topic as ContactMessage["topic"])) {
    // `validateContact` already folds an unknown topic into "general"; this is the belt to that
    // brace, so a value can never be stored that the admin list cannot render.
    return NextResponse.json({ errors: { topic: "Unknown topic." }, error: "Unknown topic." }, { status: 422 });
  }

  try {
    const message = await getRepository().createMessage({
      name: value.name,
      email: value.email,
      phone: value.phone,
      topic: value.topic as ContactMessage["topic"],
      body: value.body,
    });
    return NextResponse.json({ ok: true, reference: message.id }, { status: 201 });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    return NextResponse.json({ error: "The message could not be saved on this server.", detail: reason }, { status: 500 });
  }
}
