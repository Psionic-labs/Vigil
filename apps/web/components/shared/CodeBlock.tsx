"use client";

import { Highlight, themes, type Language } from "prism-react-renderer";
import { Copy, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/shared/Toast";

const LANGUAGE_ALIASES: Record<string, Language> = {
  html: "markup",
  js: "javascript",
  ts: "typescript",
  sh: "bash",
  shell: "bash",
};

const SUPPORTED_LANGUAGES = new Set([
  "bash",
  "css",
  "javascript",
  "json",
  "jsx",
  "markup",
  "tsx",
  "typescript",
]);

function normalizeLanguage(language: string): Language {
  const normalized = language.toLowerCase();
  const aliased = LANGUAGE_ALIASES[normalized] ?? normalized;
  return SUPPORTED_LANGUAGES.has(aliased) ? aliased : "typescript";
}

export function CodeBlock({ code, language = "typescript" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const highlightedLanguage = normalizeLanguage(language);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    if (!navigator.clipboard) {
      toast("Clipboard is not available", "error");
      return;
    }

    try {
      await navigator.clipboard.writeText(code);
      if (!isMountedRef.current) return;
      setCopied(true);
      toast("Copied to clipboard", "success");
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          setCopied(false);
        }
      }, 2000);
    } catch (error) {
      console.error("Failed to copy code block", error);
      toast("Failed to copy code", "error");
    }
  };

  return (
    <div className="relative rounded-lg border border-slate-800/80 bg-[#0B0F19] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-800/60 bg-slate-900/20">
        <span className="text-slate-400 text-xs font-mono">{language}</span>
        <button
          onClick={handleCopy}
          aria-label={copied ? "Copied" : "Copy code"}
          className="text-slate-400 hover:text-slate-100 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent flex items-center gap-1.5 text-xs font-medium"
        >
          {copied ? (
            <>
              <Check size={13} className="text-success" />
              <span className="text-success">Copied</span>
            </>
          ) : (
            <>
              <Copy size={13} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <Highlight theme={themes.vsDark} code={code.trim()} language={highlightedLanguage}>
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
