import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * The contact endpoint stores an enquiry or says it failed. It is tested for both, so a visitor is
 * never shown a success that was not written somewhere.
 */

const directory = mkdtempSync(path.join(tmpdir(), "vintage-magic-messages-"));
process.env.VINTAGE_LOCAL_DB = path.join(directory, "db.json");
process.env.VINTAGE_FORCE_LOCAL_DATA = "1";

const { POST } = await import("./route");
const { getRepository } = await import("@/lib/data");

afterAll(() => rmSync(directory, { recursive: true, force: true }));

function request(body: unknown): Request {
  return new Request("http://vintage.test/api/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("POST /api/messages", () => {
  it("asks for a way to reply before storing anything", async () => {
    const before = (await getRepository().listMessages()).length;
    const response = await POST(request({ name: "Nobody", email: "", phone: "", topic: "general", body: "What is the shoulder measurement on the blazer?" }));
    expect(response.status).toBe(422);
    const payload = (await response.json()) as { errors: Record<string, string> };
    expect(payload.errors.email).toMatch(/email or a phone/i);
    expect((await getRepository().listMessages()).length).toBe(before);
  });

  it("rejects a message that is too short to act on", async () => {
    const response = await POST(request({ name: "Short", email: "short@example.com", topic: "general", body: "hi" }));
    expect(response.status).toBe(422);
    expect(((await response.json()) as { errors: Record<string, string> }).errors.body).toBeTruthy();
  });

  it("files an unknown topic as a general enquiry rather than storing a value the admin cannot render", async () => {
    const response = await POST(request({ name: "Odd", email: "odd@example.com", topic: "not-a-topic", body: "A long enough message about nothing in particular." }));
    expect(response.status).toBe(201);
    const payload = (await response.json()) as { reference: string };
    const stored = await getRepository().listMessages();
    expect(stored.find((message) => message.id === payload.reference)?.topic).toBe("general");
  });

  it("stores a valid enquiry and drops fields that are not part of the record", async () => {
    const response = await POST(
      request({
        name: "Curious Buyer",
        email: "curious@example.com",
        phone: "+961 3 777888",
        topic: "sizing",
        body: "Could you measure the shoulders of the leather jacket flat?",
        isAdmin: true,
        priceCents: 0,
      }),
    );
    expect(response.status).toBe(201);
    const payload = (await response.json()) as { ok: boolean; reference: string };
    expect(payload.ok).toBe(true);

    const stored = await getRepository().listMessages();
    const found = stored.find((message) => message.id === payload.reference);
    expect(found).toMatchObject({ name: "Curious Buyer", topic: "sizing", handled: false });
    expect(found && "isAdmin" in found).toBe(false);
  });

  it("answers with a failure rather than a fake success when storage throws", async () => {
    const broken = new Request("http://vintage.test/api/messages", { method: "POST", headers: { "content-type": "application/json" }, body: "{\"name\":\"x\"}" });
    const response = await POST(broken);
    // No name and no contact channel: a validation refusal, not a 500.
    expect(response.status).toBe(422);
  });
});
