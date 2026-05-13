"use client";

import { Highlight, themes } from "prism-react-renderer";
import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { useToast } from "./Toast";

export function CodeBlock({ code, language = "typescript" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast("Copied to clipboard", "success");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative rounded-lg border border-border bg-surface overflow-hidden group">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
        <span className="text-text-3 text-xs font-mono">{language}</span>
        <button
          onClick={handleCopy}
          className="text-text-3 hover:text-text-1 transition-colors opacity-0 group-hover:opacity-100"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <Highlight theme={themes.vsDark} code={code.trim()} language={language as any}>
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre className={`p-4 text-sm font-mono overflow-x-auto leading-relaxed ${className}`} style={{ ...style, backgroundColor: 'transparent' }}>
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}

export function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="px-1.5 py-0.5 rounded text-xs font-mono bg-surface-2 border border-border text-accent">
      {children}
    </code>
  );
}
