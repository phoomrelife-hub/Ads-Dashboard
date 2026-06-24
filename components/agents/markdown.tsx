"use client";
import React from "react";

// Minimal, dependency-free markdown for agent text:
// **bold** (highlighted), *italic*, `code`, line breaks, and "- "/"• " bullets.
// Styling is centralized here so colour / highlight / font are easy to tweak.

const STYLE = {
  bold: { color: "#e8eaf5", fontWeight: 700 } as React.CSSProperties,         // highlight
  italic: { fontStyle: "italic", color: "#aab4c8" } as React.CSSProperties,
  code: {
    fontFamily: "'Fira Code', monospace", fontSize: "0.92em",
    background: "rgba(91,108,255,0.14)", color: "#9aa8ff",
    padding: "1px 4px", borderRadius: 4,
  } as React.CSSProperties,
};

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[2] != null) out.push(<strong key={`${keyBase}-${i}`} style={STYLE.bold}>{m[2]}</strong>);
    else if (m[3] != null) out.push(<em key={`${keyBase}-${i}`} style={STYLE.italic}>{m[3]}</em>);
    else if (m[4] != null) out.push(<code key={`${keyBase}-${i}`} style={STYLE.code}>{m[4]}</code>);
    last = re.lastIndex; i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Md({ text, className, style }: { text: string; className?: string; style?: React.CSSProperties }) {
  const lines = (text || "").split("\n");
  return (
    <div className={className} style={{ whiteSpace: "normal", wordBreak: "break-word", ...style }}>
      {lines.map((line, i) => {
        const bullet = /^\s*[-•]\s+/.test(line);
        const content = bullet ? line.replace(/^\s*[-•]\s+/, "") : line;
        if (line.trim() === "") return <div key={i} style={{ height: 6 }} />;
        return (
          <div key={i} style={bullet ? { display: "flex", gap: 6 } : undefined}>
            {bullet && <span style={{ color: "#5b6cff" }}>•</span>}
            <span>{renderInline(content, `l${i}`)}</span>
          </div>
        );
      })}
    </div>
  );
}
