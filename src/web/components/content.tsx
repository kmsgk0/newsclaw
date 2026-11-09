import { Check, Copy, ExternalLink } from "lucide-react";
import { fromMarkdown } from "mdast-util-from-markdown";
import { Children, isValidElement, useState, type ReactNode } from "react";
import Markdown from "react-markdown";
import { Link } from "react-router";
import remarkGfm from "remark-gfm";
import type { Citation, MindNode } from "../types";


interface MarkdownNode {
  type: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
}

function remarkCitations({ sources }: { sources: Citation[] }) {
  const matches = new Map<string, Citation>();
  sources.forEach((source, index) => {
    const label = source.label ?? `N${index + 1}`;
    matches.set(label, source);
    const numeric = /^N?(\d+)$/i.exec(label);
    if (numeric) matches.set(numeric[1], source);
  });
  return (tree: MarkdownNode) => {
    function visit(node: MarkdownNode) {
      if (
        !node.children ||
        ["link", "code", "inlineCode", "html"].includes(node.type)
      )
        return;
      node.children = node.children.flatMap((child) => {
        if (child.type !== "text" || !child.value) {
          visit(child);
          return [child];
        }
        const result: MarkdownNode[] = [];
        let position = 0;
        for (const match of child.value.matchAll(
          /\[\s*(N?\d+(?:\s*[,，、]\s*N?\d+)*)\s*\]/g,
        )) {
          const labels = match[1].split(/\s*[,，、]\s*/);
          if (!labels.every((label) => matches.has(label))) continue;
          result.push({
            type: "text",
            value: child.value.slice(position, match.index),
          });
          labels.forEach((label, index) => {
            if (index) result.push({ type: "text", value: " " });
            result.push({
              type: "link",
              url: `/news/${matches.get(label)!.id}`,
              children: [{ type: "text", value: `[${label}]` }],
            });
          });
          position = match.index! + match[0].length;
        }
        if (!position) return [child];
        result.push({ type: "text", value: child.value.slice(position) });
        return result;
      });
    }
    visit(tree);
  };
}

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (isValidElement<{ children?: ReactNode }>(node))
    return textContent(node.props.children);
  return Children.toArray(node)
    .map((child) =>
      typeof child === "string"
        ? child
        : isValidElement<{ children?: ReactNode }>(child)
          ? textContent(child.props.children)
          : "",
    )
    .join("");
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="code-block">
      <div className="code-toolbar">
        <span>代码</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(textContent(children));
              setCopied(true);
              setError("");
            } catch {
              setError("复制失败，请选中文本复制");
            }
          }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <pre>{children}</pre>
      {error && <small role="alert">{error}</small>}
    </div>
  );
}

export function Prose({
  children,
  sources = [],
}: {
  children: string;
  sources?: Citation[];
}) {
  return (
    <div className="prose">
      <Markdown
        remarkPlugins={[remarkGfm, [remarkCitations, { sources }]]}
        skipHtml
        components={{
          a: ({ href, children: text }) =>
            href?.startsWith("/news/") ? (
              <Link
                className={
                  /^\[N?\d+\]$/.test(textContent(text)) ? "citation" : undefined
                }
                to={href}
              >
                {text}
              </Link>
            ) : (
              <a
                href={href}
                target={href?.startsWith("http") ? "_blank" : undefined}
                rel="noreferrer"
              >
                {text}
              </a>
            ),
          pre: ({ children: code }) => <CodeBlock>{code}</CodeBlock>,
          table: ({ children: rows }) => (
            <div
              className="markdown-table"
              tabIndex={0}
              role="region"
              aria-label="内容表格，可左右滚动"
            >
              <table>{rows}</table>
            </div>
          ),
          img: ({ src, alt }) => (
            <img src={src} alt={alt ?? ""} loading="lazy" />
          ),
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}

function citedSourceIds(
  content: string,
  sources: Citation[],
  structure?: MindNode,
) {
  const ids = new Set<string>();
  const targets = new Map(
    sources.flatMap((source) => [
      [source.url, source.id],
      [`/news/${source.id}`, source.id],
    ]),
  );
  const tree = fromMarkdown(content);
  remarkCitations({ sources })(tree);
  function visit(node: MarkdownNode) {
    if (node.type === "link" && node.url && targets.has(node.url))
      ids.add(targets.get(node.url)!);
    node.children?.forEach(visit);
  }
  function visitStructure(node: MindNode) {
    node.sourceIds.forEach((id) => ids.add(id));
    node.children?.forEach(visitStructure);
  }
  visit(tree);
  if (structure) visitStructure(structure);
  return ids;
}

function SourceRows({ sources }: { sources: Citation[] }) {
  return (
    <>
      {sources.map((source, index) => (
        <div className="source-row" key={`${source.id}-${index}`}>
          <Link className="source-link" to={`/news/${source.id}`}>
            <span>{source.label ?? `N${index + 1}`}</span>
            <div>
              {source.title}
              <small>{source.sourceName}</small>
            </div>
          </Link>
          <a
            className="icon-button"
            href={source.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`查看原文：${source.title}`}
          >
            <ExternalLink size={14} />
          </a>
        </div>
      ))}
    </>
  );
}

export function Sources({
  sources,
  content,
  structure,
}: {
  sources: Citation[];
  content?: string;
  structure?: MindNode;
}) {
  if (!sources.length) return null;
  const labeled = sources.map((source, index) => ({
    ...source,
    label: source.label ?? `N${index + 1}`,
  }));
  const cited =
    content === undefined ? null : citedSourceIds(content, labeled, structure);
  const primary = cited
    ? labeled.filter((source) => cited.has(source.id))
    : labeled;
  const other = cited ? labeled.filter((source) => !cited.has(source.id)) : [];
  return (
    <section className="sources" aria-label="依据材料">
      {primary.length > 0 && (
        <>
          <h4>依据材料</h4>
          <SourceRows sources={primary} />
        </>
      )}
      {other.length > 0 && (
        <details className="other-sources">
          <summary>其他检索材料（{other.length}）</summary>
          <SourceRows sources={other} />
        </details>
      )}
    </section>
  );
}

export function SourceLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a className="text-link" href={href} target="_blank" rel="noreferrer">
      {children}
      <ExternalLink size={14} />
    </a>
  );
}
