import { getDomain } from "tldts";
import { ContentFetcher } from "./contentFetcher";
import { buildContentEvidence } from "./contentEvidence";
import { ContentPolicy } from "./contentPolicy";
import {
  analyzeHTML,
  findElements,
  getAttribute,
  normalizeWhitespace,
  parseHTML,
  textContent,
} from "./htmlAnalyzer";
import { analyzeForms } from "./formAnalyzer";
import { analyzeLinks } from "./linkAnalyzer";
import { analyzeResources } from "./resourceAnalyzer";
import { analyzeScripts } from "./scriptAnalyzer";
import { ContentAnalysisResult, ContentAnalyzerOptions } from "./types";

export class ContentAnalyzer {
  private readonly policy: ContentPolicy;
  private readonly fetcher: ContentFetcher;

  constructor(options: ContentAnalyzerOptions = {}) {
    this.policy = options.policy ?? new ContentPolicy();
    this.fetcher =
      options.fetcher ?? new ContentFetcher({ policy: this.policy });
  }

  public async analyze(url: string): Promise<ContentAnalysisResult> {
    const result: ContentAnalysisResult = {
      fetched: false,
      finalUrl: null,
      statusCode: null,
      contentType: null,
      contentLength: null,
      title: null,
      language: null,
      forms: [],
      scripts: [],
      links: [],
      resources: [],
      html: {
        elementCount: 0,
        scriptCount: 0,
        iframeCount: 0,
        formCount: 0,
        inputCount: 0,
        hiddenElementCount: 0,
        externalResourceCount: 0,
        inlineStyleCount: 0,
        inlineScriptCount: 0,
        metaRefreshDetected: false,
        titleLength: 0,
      },
      evidence: [],
      errors: [],
    };
    let pageUrl: URL;
    try {
      pageUrl = new URL(url);
    } catch {
      result.errors.push({
        type: "invalid-url",
        message: "Content URL is malformed.",
      });
      return result;
    }
    try {
      const fetched = await this.fetcher.fetch(url);
      result.fetched = true;
      result.finalUrl = fetched.finalUrl;
      result.statusCode = fetched.response.status;
      result.contentType = fetched.response.headers.get("content-type");
      result.contentLength = fetched.contentLength;
      const root = parseHTML(fetched.body);
      const context = {
        pageUrl,
        pageDomain: getDomain(pageUrl.hostname),
        maxTextLength: this.policy.config.maxTextLength,
      };
      result.html = analyzeHTML(root, this.policy.config.maxHtmlNodes);
      const titleNode = findElements(
        root,
        "title",
        this.policy.config.maxHtmlNodes,
      )[0];
      result.title = titleNode
        ? textContent(titleNode, 500).slice(0, 500) || null
        : null;
      result.html.titleLength = result.title?.length ?? 0;
      const htmlNode = findElements(
        root,
        "html",
        this.policy.config.maxHtmlNodes,
      )[0];
      result.language = htmlNode ? getAttribute(htmlNode, "lang") : null;
      result.forms = analyzeForms(root, context);
      result.scripts = analyzeScripts(root, context);
      result.links = analyzeLinks(root, context);
      result.resources = analyzeResources(root, context);
      result.evidence = buildContentEvidence(result);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Content fetch or analysis failed.";
      const type = /unsupported content/i.test(message)
        ? "unsupported-content-type"
        : /size limit/i.test(message)
          ? "response-too-large"
          : /timed out|abort/i.test(message)
            ? "timeout"
            : /blocked|private|local|internal|credential|unsupported protocol/i.test(
                  message,
                )
              ? "blocked-destination"
              : "network";
      result.errors.push({ type, message });
    }
    return result;
  }
}
