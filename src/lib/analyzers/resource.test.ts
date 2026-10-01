import { describe, expect, it } from "vitest";
import { classifyResource } from "./resource";

describe("resource classification", () => {
  it("recognizes API-style endpoints without treating them as threats", () => {
    expect(classifyResource(new URL("https://api.telegram.org/bot123/sendMessage"))).toBe("API_ENDPOINT");
  });
  it("recognizes ordinary pages and downloads", () => {
    expect(classifyResource(new URL("https://example.com"))).toBe("WEB_PAGE");
    expect(classifyResource(new URL("https://example.com/file.zip"))).toBe("FILE_DOWNLOAD");
  });
});
