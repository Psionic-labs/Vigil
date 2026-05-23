import * as React from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "elevated" | "inset" | "accent";
}

export function Card({ className = "", variant = "elevated", children, ...props }: CardProps) {
  const baseStyles = "rounded-xl overflow-hidden transition-all duration-200";
  
  const variants = {
    elevated: "bg-surface border border-border shadow-sm hover:shadow-md",
    inset: "bg-surface-2/60 border border-border/60",
    accent: "bg-surface border border-border shadow-sm relative overflow-hidden",
  };

  return (
    <div className={`${baseStyles} ${variants[variant]} ${className}`} {...props}>
      {variant === "accent" && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-accent/40 to-accent" />
      )}
      {children}
    </div>
  );
}

export function CardHeader({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`px-5 py-4 border-b border-border/50 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className = "", children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={`font-semibold text-text-1 tracking-tight ${className}`} {...props}>
      {children}
    </h3>
  );
}

export function CardDescription({ className = "", children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={`text-sm text-text-3 mt-1 ${className}`} {...props}>
      {children}
    </p>
  );
}

export function CardContent({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`p-5 ${className}`} {...props}>
      {children}
    </div>
  );
}
