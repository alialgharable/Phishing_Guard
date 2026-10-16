import type { Canary, DetonationResult, DynamicEvidence } from "./types";
import { findCanary } from "./canary";
import { registrableOfUrl } from "./util";

const CLICKFIX =
  /powershell|pwsh|mshta|cmd(\.exe)?\s*\/c|curl[^|\n]*\|\s*(ba)?sh|wget[^|\n]*\|\s*(ba)?sh|bitsadmin|certutil|rundll32|regsvr32|\biex\b|-enc(odedcommand)?\s|i am not a robot/i;
const RISKY_EXT =
  /\.(exe|msi|scr|apk|iso|img|lnk|js|jse|vbs|hta|bat|cmd|ps1|jar|dmg|pkg)$/i;
const ARCHIVE_EXT = /\.(zip|rar|7z)$/i;

export interface BehaviorOptions {
  /**
   * Tranco top-N lookup. A canary sent to a reputable domain (SSO, IdP,
   * payment processor) is downgraded — not treated as near-proof exfiltration.
   */
  isReputable?: (registrableDomain: string) => boolean;
}

export function behaviorEvidence(
  r: DetonationResult,
  canary: Canary | null,
  o: BehaviorOptions = {},
): DynamicEvidence[] {
  const out: DynamicEvidence[] = [];
  const page = registrableOfUrl(r.landingUrl || r.finalUrl);
  const byApi = (a: string) => r.apiEvents.filter((e) => e.api === a);

  // Permission requests: ungated = 4–5× more suspicious than gesture-gated.
  const perm = (
    api: string,
    id: string,
    label: string,
    ungated: number,
    gated: number,
  ) => {
    const ev = byApi(api);
    if (!ev.length) return;
    const ungatedEv = ev.filter((e) => !e.gesture);
    out.push({
      id,
      group: "behavioral",
      score: ungatedEv.length ? ungated : gated,
      description: ungatedEv.length
        ? `${label} requested on load with no user interaction`
        : `${label} requested after a user gesture`,
      data: { count: ev.length, stack: ev[0].stack },
    });
  };
  perm("getUserMedia", "beh.camera_mic", "Camera/microphone", 25, 5);
  perm("geolocation", "beh.geolocation", "Geolocation", 15, 3);
  perm("notification", "beh.notification", "Notification permission", 10, 2);
  for (const api of [
    "usb.requestDevice",
    "bluetooth.requestDevice",
    "hid.requestDevice",
    "serial.requestPort",
  ]) {
    perm(api, `beh.${api}`, api, 15, 4);
  }

  // ClickFix / clipboard hijack
  const clip = [
    ...byApi("clipboard.writeText"),
    ...r.apiEvents.filter(
      (e) =>
        e.api.startsWith("execCommand") && e.detail?.["cmd"] === "copy",
    ),
  ];
  const cmd = clip
    .map((e) => String(e.detail?.["text"] ?? ""))
    .find((t) => CLICKFIX.test(t) || /[A-Za-z0-9+/=]{120,}/.test(t));
  if (cmd) {
    out.push({
      id: "beh.clipboard_command",
      group: "behavioral",
      score: 40,
      description:
        "Page put a shell command on the clipboard (ClickFix-style malware delivery)",
      data: { sample: cmd.slice(0, 160) },
    });
  } else if (clip.some((e) => !e.gesture)) {
    out.push({
      id: "beh.clipboard_write",
      group: "behavioral",
      score: 10,
      description: "Page wrote to the clipboard without a user gesture",
    });
  }

  if (byApi("listener").some((e) => e.detail?.["type"] === "contextmenu")) {
    out.push({
      id: "beh.contextmenu_listener",
      group: "behavioral",
      score: 4,
      description:
        'Global context-menu handler (often used to block "view source")',
    });
  }
  if (byApi("webdriver.probe").length) {
    out.push({
      id: "beh.automation_probe",
      group: "behavioral",
      score: 4,
      description: "Page probes navigator.webdriver (bot detection)",
    });
  }
  if (byApi("dialog").length >= 3) {
    out.push({
      id: "beh.dialog_spam",
      group: "behavioral",
      score: 15,
      description: "Repeated alert/confirm dialogs (tech-support scam pattern)",
    });
  }
  if (r.bitb) {
    out.push({
      id: "beh.fake_browser_window",
      group: "behavioral",
      score: 30,
      description:
        "Fake browser window (Browser-in-the-Browser) wrapping a login form",
    });
  }

  // Keystroke exfiltration: cross-domain requests while credentials are typed.
  if (r.typing) {
    const hits = r.requests.filter(
      (q) =>
        q.t >= r.typing!.start &&
        q.t <= r.typing!.end + 300 &&
        registrableOfUrl(q.url) !== page &&
        (q.postData || new URL(q.url).search),
    );
    if (hits.length >= Math.max(4, Math.floor(r.typing.chars / 2))) {
      out.push({
        id: "beh.keystroke_exfil",
        group: "exfiltration",
        score: 30,
        description: `Page sent ${hits.length} cross-domain requests while credentials were being typed (keylogger)`,
        data: { sample: hits[0].url },
      });
    }
  }

  // Honeytoken: where did the fake credentials go?
  if (canary) {
    const seen = new Set<string>();
    for (const q of r.requests) {
      const hits = findCanary(`${q.url}\n${q.postData ?? ""}`, canary);
      if (!hits.length) continue;
      const dest = registrableOfUrl(q.url);
      if (seen.has(dest)) continue;
      seen.add(dest);
      if (dest !== page) {
        const reputable = o.isReputable?.(dest) ?? false;
        out.push({
          id: "exfil.canary_cross_domain",
          group: "exfiltration",
          score: reputable ? 15 : 60,
          hard: !reputable,
          description: `Credentials typed into the page were sent to a different domain (${dest})${reputable ? " (reputable domain: possible SSO)" : ""}`,
          data: {
            dest,
            method: q.method,
            fields: hits.map((h) => h.field),
            encodings: [...new Set(hits.map((h) => h.encoding))],
            inUrl: q.url.includes(canary.id),
          },
        });
      } else {
        out.push({
          id: "exfil.canary_same_origin",
          group: "exfiltration",
          score: 0,
          description:
            "Credentials were posted back to the same domain (normal for real login forms; not evidence by itself)",
          data: { dest },
        });
      }
    }
  }

  // Post-submit flow analysis
  const ps = r.postSubmit;
  if (ps) {
    if (ps.asksOtp) {
      out.push({
        id: "flow.otp_after_fake_password",
        group: "behavioral",
        score: 20,
        description:
          "Site asked for an OTP/verification code right after a garbage password (real sites reject it first)",
      });
    } else if (ps.sameFormReshown) {
      out.push({
        id: "flow.fake_wrong_password",
        group: "behavioral",
        score: 8,
        description:
          "Login form simply re-appeared after submit (credential-harvest loop)",
      });
    }
    const away = ps.navDomains.filter((d) => d && d !== page);
    if (away.length) {
      out.push({
        id: "flow.redirect_after_submit",
        group: "behavioral",
        score: 12,
        description: `Navigated to another domain right after submit (${away[0]}), typical of "redirect to the real site" kits`,
        data: { away },
      });
    }
  }

  // Drive-by downloads (we never click anything, so any download was triggered by the page)
  for (const d of r.downloads) {
    if (RISKY_EXT.test(d.suggestedName)) {
      out.push({
        id: "dl.executable",
        group: "behavioral",
        score: 35,
        description: `Automatic download of a risky file type (${d.suggestedName})`,
        data: { sha256: d.sha256 },
      });
    } else if (ARCHIVE_EXT.test(d.suggestedName)) {
      out.push({
        id: "dl.archive",
        group: "behavioral",
        score: 20,
        description: `Automatic download of an archive (${d.suggestedName})`,
        data: { sha256: d.sha256 },
      });
    } else {
      out.push({
        id: "dl.other",
        group: "behavioral",
        score: 10,
        description: `Automatic download (${d.suggestedName})`,
        data: { sha256: d.sha256 },
      });
    }
  }

  return out;
}
