import {
  chromium,
  type Browser,
  type Download,
  type Page,
  type Request,
} from "playwright";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { HOOK_SCRIPT } from "./hooks";
import { isAllowedHost, registrableOfUrl } from "./util";
import type { DetonationOptions, DetonationResult } from "./types";

const LAUNCH_ARGS = [
  "--use-fake-device-for-media-stream", // camera/mic requests succeed against a test pattern
  "--use-fake-ui-for-media-stream",
  "--disable-dev-shm-usage",
  "--no-first-run",
  "--mute-audio",
  "--disable-background-networking",
  // Inside the container the gVisor sandbox is the isolation boundary, not --no-sandbox.
  ...(process.env["PG_IN_SANDBOX"] === "1" ? ["--no-sandbox"] : []),
];
const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const safePost = (r: Request) => {
  try {
    return r.postData();
  } catch {
    return null;
  }
};
const safeFrame = (r: Request) => {
  try {
    return r.frame()?.url() ?? "";
  } catch {
    return "";
  }
};

export async function detonate(
  url: string,
  opts: DetonationOptions = {},
  shared?: Browser,
): Promise<DetonationResult> {
  const t0 = Date.now();
  const timeout = opts.timeoutMs ?? 45_000;
  const browser =
    shared ??
    (await chromium.launch({
      headless: true,
      proxy: opts.proxy,
      args: LAUNCH_ARGS,
    }));
  const res: DetonationResult = {
    inputUrl: url,
    landingUrl: url,
    finalUrl: url,
    title: "",
    html: "",
    screenshot: null,
    faviconUrl: null,
    faviconBytes: null,
    redirectChain: [],
    requests: [],
    apiEvents: [],
    downloads: [],
    scripts: [],
    forms: [],
    typing: null,
    bitb: false,
    submitted: false,
    postSubmit: null,
    blockedRequests: [],
    errors: [],
    durationMs: 0,
  };
  const chain = new Set<string>();
  const pending: Promise<unknown>[] = [];

  const ctx = await browser.newContext({
    userAgent: opts.userAgent ?? DEFAULT_UA,
    locale: opts.locale ?? "en-US",
    extraHTTPHeaders: opts.referer ? { Referer: opts.referer } : undefined,
    geolocation: { latitude: 48.8566, longitude: 2.3522 }, // fake — never your real location
    permissions: [
      "geolocation",
      "camera",
      "microphone",
      "notifications",
      "clipboard-read",
      "clipboard-write",
    ],
    acceptDownloads: true,
    ...(opts.mobile
      ? {
          viewport: { width: 390, height: 844 },
          isMobile: true,
          hasTouch: true,
          deviceScaleFactor: 3,
        }
      : { viewport: { width: 1366, height: 768 } }),
  });
  const kill = setTimeout(() => {
    ctx.close().catch(() => {});
  }, timeout * 2);

  await ctx.exposeFunction("__pgReport", (s: string) => {
    try {
      res.apiEvents.push(JSON.parse(s));
    } catch {
      /* ignore malformed reports */
    }
  });
  await ctx.addInitScript(HOOK_SCRIPT);

  // SSRF guard: nothing in the private address space is ever fetched.
  // DNS rebinding can still race this; also enforce it at the network layer
  // via infra/sandbox-firewall.sh.
  await ctx.route("**/*", async (route) => {
    let u: URL;
    try {
      u = new URL(route.request().url());
    } catch {
      return route.abort("blockedbyclient");
    }
    if (await isAllowedHost(u.hostname, opts.allowPrivate)) {
      return route.continue();
    }
    res.blockedRequests.push(route.request().url());
    return route.abort("blockedbyclient");
  });

  const handleDownload = async (d: Download) => {
    try {
      const p = await d.path();
      if (!p) return;
      const st = await fs.stat(p);
      const sha =
        st.size > 50_000_000
          ? ""
          : createHash("sha256")
              .update(await fs.readFile(p))
              .digest("hex");
      res.downloads.push({
        suggestedName: d.suggestedFilename(),
        sha256: sha,
        bytes: st.size,
      });
      await d.delete();
    } catch (e) {
      res.errors.push("download: " + String(e).slice(0, 120));
    }
  };

  const attach = (p: Page) => {
    p.on("request", (r) =>
      res.requests.push({
        url: r.url(),
        method: r.method(),
        resourceType: r.resourceType(),
        postData: safePost(r),
        t: Date.now(),
        frameUrl: safeFrame(r),
      }),
    );
    p.on("response", (r) => {
      const s = r.status();
      if (s >= 300 && s < 400 && r.request().isNavigationRequest()) {
        chain.add(r.url());
      }
      if (r.request().resourceType() === "script" && res.scripts.length < 25) {
        pending.push(
          r
            .text()
            .then((b) => {
              if (b.length < 600_000)
                res.scripts.push({ url: r.url(), body: b });
            })
            .catch(() => {}),
        );
      }
    });
    p.on("framenavigated", (f) => {
      if (f === p.mainFrame()) chain.add(f.url());
    });
    p.on("download", (d) => {
      pending.push(handleDownload(d));
    });
    p.on("dialog", (d) => {
      res.apiEvents.push({
        api: "dialog",
        t: Date.now(),
        gesture: false,
        stack: "",
        detail: { message: d.message().slice(0, 200) },
      });
      d.dismiss().catch(() => {});
    });
  };
  ctx.on("page", attach);

  try {
    const page = await ctx.newPage();
    await page
      .goto(url, { waitUntil: "domcontentloaded", timeout })
      .catch((e) => res.errors.push("goto: " + String(e).slice(0, 160)));
    await page
      .waitForLoadState("networkidle", { timeout: 8000 })
      .catch(() => {});

    // Behave a little like a real person.
    await page.mouse.move(200, 200).catch(() => {});
    await page.mouse.wheel(0, 400).catch(() => {});
    await page.waitForTimeout(2500);

    res.landingUrl = page.url();
    const dom = await page
      .evaluate(() => {
        const forms = [...document.forms].map((f) => ({
          action: f.action || location.href,
          method: (f.method || "get").toLowerCase(),
          hasPassword: !!f.querySelector("input[type=password]"),
        }));
        if (
          !forms.some((f) => f.hasPassword) &&
          document.querySelector("input[type=password]")
        ) {
          forms.push({
            action: location.href,
            method: "js",
            hasPassword: true,
          });
        }
        const icon = document.querySelector(
          'link[rel~="icon"]',
        ) as HTMLLinkElement | null;
        // Browser-in-the-Browser heuristic.
        const urlLike = /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i;
        const bitb = [...document.querySelectorAll("div,span,p")].some((el) => {
          const t = (el.textContent || "").trim();
          if (el.children.length || t.length > 80 || !urlLike.test(t))
            return false;
          let a: HTMLElement | null = el.parentElement;
          let floating = false,
            hasTarget = false;
          for (let i = 0; i < 6 && a; i++, a = a.parentElement) {
            const s = getComputedStyle(a);
            if (
              (s.position === "fixed" || s.position === "absolute") &&
              s.boxShadow !== "none" &&
              parseFloat(s.borderRadius) > 0
            )
              floating = true;
            if (a.querySelector("input[type=password], iframe"))
              hasTarget = true;
          }
          return floating && hasTarget;
        });
        return {
          title: document.title,
          forms,
          favicon: icon?.href ?? location.origin + "/favicon.ico",
          bitb,
        };
      })
      .catch(() => null);

    if (dom) {
      res.title = dom.title;
      res.forms = dom.forms;
      res.faviconUrl = dom.favicon;
      res.bitb = dom.bitb;
    }
    res.html = await page.content().catch(() => "");
    res.screenshot = await page.screenshot({ type: "png" }).catch(() => null);

    if (res.faviconUrl) {
      let faviconUrl: URL;
      try {
        faviconUrl = new URL(res.faviconUrl);
      } catch {
        faviconUrl = null as unknown as URL;
      }
      if (
        faviconUrl &&
        (await isAllowedHost(faviconUrl.hostname, opts.allowPrivate))
      ) {
        const r = await ctx.request
          .get(res.faviconUrl, { timeout: 5000 })
          .catch(() => null);
        if (r?.ok()) res.faviconBytes = await r.body().catch(() => null);
      }
    }

    // PhishGuard never types credentials or submits forms to remote pages.
    // Canary generation/search remains available for offline fixtures and
    // captured-request analysis, but live detonation is observation-only.
    res.finalUrl = page.url();
  } catch (e) {
    res.errors.push(String(e).slice(0, 200));
  } finally {
    await Promise.allSettled(pending);
    res.redirectChain = [...chain];
    clearTimeout(kill);
    await ctx.close().catch(() => {});
    if (!shared) await browser.close().catch(() => {});
    res.durationMs = Date.now() - t0;
  }
  return res;
}
