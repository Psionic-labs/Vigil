export function CodeBlock({ code, language = "typescript" }: { code: string; language?: string }) {
  return (
    <div className="relative rounded-lg border border-border bg-surface overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
        <span className="text-text-3 text-xs font-mono">{language}</span>
      </div>
      <pre className="p-4 text-sm font-mono text-text-1 overflow-x-auto leading-relaxed">
        <code>{code}</code>
      </pre>
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
