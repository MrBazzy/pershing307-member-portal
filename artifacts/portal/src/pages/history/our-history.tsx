import { useGetHistoryPage } from "@workspace/api-client-react";
import { HistoryLayout } from "@/components/history/history-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Landmark } from "lucide-react";
import { format } from "date-fns";

const YEAR_ONLY = /^\s*(\d{4})\s*$/;
const YEAR_WITH_TITLE = /^\s*(\d{4})\s*[-–—:]\s*(.+?)\s*$/;

function stripAnchors(html: string): string {
  return html.replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, "$1").replace(/<[^>]+>/g, "").trim();
}

function dividerHtml(): string {
  return `<div class="chapter-divider"><div class="chapter-divider-line"></div><div class="chapter-divider-diamond"></div><div class="chapter-divider-line"></div></div>`;
}

function chapterBlock(year: string, title: string, isFirst: boolean): string {
  const divider = isFirst ? "" : dividerHtml();
  const header = year
    ? `<div class="chapter-header"><span class="chapter-year">${year}</span><span class="chapter-title">${title}</span></div>`
    : `<div class="chapter-header"><span class="chapter-title-only">${title}</span></div>`;
  return `<div class="chapter-block">${divider}${header}</div>`;
}

/** Returns true if a <p> inner HTML is entirely bold+underlined (any nesting order). */
function isBoldUnderlinedParagraph(inner: string): boolean {
  const s = inner.trim();
  return (
    /^<strong[^>]*>\s*<u[^>]*>[\s\S]*<\/u>\s*<\/strong>$/i.test(s) ||
    /^<u[^>]*>\s*<strong[^>]*>[\s\S]*<\/strong>\s*<\/u>$/i.test(s)
  );
}

/** Extract year from patterns like "Title (1959)", "(1959) Title", or "1959 — Title". */
function extractYear(text: string): { year: string; title: string } {
  // "Title (1959)" or "(1959) Title"
  const bracketed = text.match(/^(.*?)\s*\((\d{4})\)\s*(.*?)$/);
  if (bracketed) {
    const year = bracketed[2];
    const title = (bracketed[1] + " " + bracketed[3]).trim().replace(/\s{2,}/g, " ");
    return { year, title };
  }
  // "1959 — Title" or "1959: Title"
  const yearFirst = text.match(YEAR_WITH_TITLE);
  if (yearFirst) return { year: yearFirst[1], title: yearFirst[2].trim() };
  // Bare year
  const yearOnly = text.match(YEAR_ONLY);
  if (yearOnly) return { year: yearOnly[1], title: "" };

  return { year: "", title: text };
}

function enhanceContent(html: string): string {
  type TokType = "h2" | "h3" | "h4" | "chapter-p" | "text";
  const tokens: Array<{ type: TokType; text: string; raw: string }> = [];

  // Match both headings and paragraphs
  const re = /<(h[234]|p)([^>]*?)>([\s\S]*?)<\/(?:h[234]|p)>/gi;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(html)) !== null) {
    if (match.index > last) {
      tokens.push({ type: "text", text: "", raw: html.slice(last, match.index) });
    }
    const tag = match[1].toLowerCase();
    const inner = match[3];
    const plainText = stripAnchors(inner);

    if (tag === "p" && isBoldUnderlinedParagraph(inner)) {
      tokens.push({ type: "chapter-p", text: plainText, raw: match[0] });
    } else if (tag === "h2" || tag === "h3" || tag === "h4") {
      tokens.push({ type: tag as TokType, text: plainText, raw: match[0] });
    } else {
      tokens.push({ type: "text", text: "", raw: match[0] });
    }
    last = match.index + match[0].length;
  }
  if (last < html.length) {
    tokens.push({ type: "text", text: "", raw: html.slice(last) });
  }

  const output: string[] = [];
  let chapterCount = 0;
  let i = 0;

  while (i < tokens.length) {
    const tok = tokens[i];

    if (tok.type === "chapter-p") {
      const { year, title } = extractYear(tok.text);
      output.push(chapterBlock(year, title, chapterCount === 0));
      chapterCount++;
    } else if (tok.type === "h2") {
      const yearOnly = tok.text.match(YEAR_ONLY);
      const yearWithTitle = tok.text.match(YEAR_WITH_TITLE);
      if (yearOnly) {
        const year = yearOnly[1];
        const next = tokens[i + 1];
        if (next && next.type === "h3") {
          output.push(chapterBlock(year, next.text, chapterCount === 0));
          chapterCount++;
          i += 2;
          continue;
        } else {
          output.push(chapterBlock(year, "", chapterCount === 0));
          chapterCount++;
        }
      } else if (yearWithTitle) {
        output.push(chapterBlock(yearWithTitle[1], yearWithTitle[2], chapterCount === 0));
        chapterCount++;
      } else {
        output.push(chapterBlock("", tok.text, chapterCount === 0));
        chapterCount++;
      }
    } else if (tok.type === "h3") {
      output.push(chapterBlock("", tok.text, chapterCount === 0));
      chapterCount++;
    } else if (tok.type === "h4") {
      const isFirst = chapterCount === 0;
      const divider = isFirst ? "" : dividerHtml();
      output.push(`<div class="chapter-block">${divider}<div class="chapter-header"><span class="chapter-title-only">${tok.text}</span></div></div>`);
      chapterCount++;
    } else {
      output.push(tok.raw);
    }

    i++;
  }

  return output.join("");
}

function prepareContent(content: string): string {
  if (!content.trim()) return "";
  if (/<[a-z][\s\S]*>/i.test(content)) return content;
  return content
    .split(/\n\n+/)
    .filter(Boolean)
    .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function ElegantDivider() {
  return (
    <div className="flex items-center gap-3 my-1" aria-hidden="true">
      <div className="flex-1 h-px bg-border" />
      <div className="w-1.5 h-1.5 bg-sidebar-active/50 rotate-45 shrink-0" />
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

export default function OurHistoryPage() {
  const { data, isLoading } = useGetHistoryPage();
  const page = data?.page;

  return (
    <HistoryLayout>
      {isLoading ? (
        <div className="border border-border rounded-xl shadow-sm bg-card overflow-hidden">
          <div className="px-8 py-10 border-b border-border text-center space-y-3">
            <Skeleton className="h-4 w-24 mx-auto" />
            <Skeleton className="h-6 w-72 mx-auto" />
            <Skeleton className="h-4 w-56 mx-auto" />
          </div>
          <div className="px-6 py-8 max-w-[850px] mx-auto space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-px w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      ) : (
        <div className="border border-border rounded-xl shadow-sm bg-card overflow-hidden">

          {/* Hero */}
          <div className="relative px-8 py-10 text-center border-b border-border bg-primary/[0.015] overflow-hidden">
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
              aria-hidden="true"
            >
              <span className="text-[220px] font-serif font-bold text-primary opacity-[0.03] leading-none">
                G
              </span>
            </div>
            <div className="relative">
              <div className="inline-flex items-center gap-3 mb-5">
                <span className="h-px w-8 bg-sidebar-active/50" />
                <span className="text-[11px] font-semibold tracking-widest text-sidebar-active uppercase">
                  1959 – Present
                </span>
                <span className="h-px w-8 bg-sidebar-active/50" />
              </div>
              <h1 className="text-2xl font-serif font-bold text-primary mb-2 leading-snug">
                General John J. Pershing Lodge No. 307
              </h1>
              <p className="text-sm text-muted-foreground">
                A Heritage of Military Service, Brotherhood and Freemasonry
              </p>
            </div>
          </div>

          {/* Article */}
          <div className="px-6 py-10">
            <div className="max-w-[850px] mx-auto">

              {/* Section header */}
              <div className="mb-8">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-[11px] font-bold text-sidebar-active bg-sidebar-active/10 border border-sidebar-active/30 px-2.5 py-1 rounded-sm tracking-wider">
                    1959
                  </span>
                  <h2 className="text-xl font-serif font-semibold text-primary">
                    {page?.title ?? "Our History"}
                  </h2>
                </div>
                <ElegantDivider />
              </div>

              {/* Prose */}
              {page?.content ? (
                <div
                  className="history-article"
                  dangerouslySetInnerHTML={{
                    __html: enhanceContent(prepareContent(page.content)),
                  }}
                />
              ) : (
                <div className="text-center py-12">
                  <Landmark className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Check back later.</p>
                </div>
              )}

              {/* Last updated */}
              {page?.updatedAt && (
                <div className="mt-10">
                  <ElegantDivider />
                  <p className="text-[11px] text-muted-foreground mt-3">
                    Last updated {format(new Date(page.updatedAt), "MMMM d, yyyy")}
                  </p>
                </div>
              )}

            </div>
          </div>

        </div>
      )}
    </HistoryLayout>
  );
}
