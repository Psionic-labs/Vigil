"use client"

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Activity, Mail, Lock, ArrowRight, AlertCircle } from "lucide-react";
import { Github } from "@/components/ui/GithubIcon";
import Link from "next/link";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { error: signInError } = await authClient.signIn.email({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message || "Invalid credentials. Please try again.");
      } else {
        window.location.href = "/";
      }
    } catch (err: any) {
      console.error("Sign in failed:", err);
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGithubSignIn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await authClient.signIn.social({
        provider: "github",
        callbackURL: "/",
      });
    } catch (err: any) {
      console.error("GitHub sign in failed:", err);
      setError(err.message || "GitHub authentication failed.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-[1fr_520px] bg-slate-950 font-sans text-slate-100 overflow-hidden relative">
      {/* Background radial glow */}
      <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-500/10 rounded-full blur-[160px] pointer-events-none" />

      {/* Brand Panel (Left) */}
      <div className="hidden lg:flex flex-col justify-between p-12 relative border-r border-slate-900 bg-slate-950/60 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/30">
            <Activity className="w-4.5 h-4.5 text-white" />
          </div>
          <span className="font-semibold text-white text-lg tracking-tight">Vigil</span>
        </div>

        <div className="my-auto max-w-lg space-y-6">
          <div className="relative">
            <div className="absolute -top-8 -left-8 w-24 h-24 bg-indigo-600/10 rounded-full blur-xl animate-pulse" />
            <h2 className="text-4xl font-extrabold text-white leading-tight tracking-tight">
              AI-native session <br />
              <span className="text-indigo-400 bg-clip-text">triage for developers</span>
            </h2>
          </div>
          <p className="text-slate-400 text-base leading-relaxed">
            Diagnose user friction, review high-fidelity session replays, and resolve exceptions using telemetry-aware LLM agents.
          </p>

          {/* Interactive SVG wave graphic */}
          <div className="h-32 w-full rounded-2xl bg-slate-900/40 border border-slate-800/80 p-5 flex flex-col justify-between relative overflow-hidden shadow-inner">
            <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
              <span>ACTIVE SESSION REPLAY</span>
              <span className="text-indigo-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-ping" />
                Triaging...
              </span>
            </div>
            <div className="h-12 flex items-end gap-1 overflow-hidden">
              {[40, 65, 30, 85, 45, 55, 75, 90, 45, 60, 30, 50, 70, 80, 95, 35, 60, 40, 75, 50].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 bg-indigo-500/20 rounded-t-sm transition-all duration-300"
                  style={{
                    height: `${h}%`,
                    backgroundColor: i === 14 ? 'rgb(99 102 241)' : undefined,
                    opacity: i === 14 ? 0.9 : undefined,
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="text-xs text-slate-500 font-mono">
          © {new Date().getFullYear()} Vigil Labs, Inc. All rights reserved.
        </div>
      </div>

      {/* Form Panel (Right) */}
      <div className="flex flex-col justify-center items-center p-6 sm:p-12 md:p-16 relative bg-slate-950/90">
        <div className="w-full max-w-sm space-y-8 animate-fade-up">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-white">Welcome back</h1>
            <p className="text-sm text-slate-400">
              Enter your credentials to manage your projects.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-950/40 border border-red-900/60 text-red-200 text-sm animate-fade-up">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  id="email"
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9.5 pr-4 py-2.5 text-sm bg-slate-900 border border-slate-800 rounded-xl
                             text-white placeholder:text-slate-500 focus:outline-none focus:ring-2
                             focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-sans"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Password
                </label>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9.5 pr-4 py-2.5 text-sm bg-slate-900 border border-slate-800 rounded-xl
                             text-white placeholder:text-slate-500 focus:outline-none focus:ring-2
                             focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-1.5 py-3 bg-indigo-600 hover:bg-indigo-500
                         active:bg-indigo-700 text-white font-medium rounded-xl transition-all shadow-lg
                         shadow-indigo-600/10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group mt-2"
            >
              {isLoading ? "Signing in..." : "Sign In"}
              {!isLoading && <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />}
            </button>
          </form>

          {/* Social Sign-in Placeholder */}
          <div className="space-y-4">
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-900" />
              </div>
              <span className="relative px-3 text-xs uppercase tracking-wider text-slate-500 bg-slate-950 font-mono">
                or continue with
              </span>
            </div>

            <button
              type="button"
              onClick={handleGithubSignIn}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-900 hover:bg-slate-800/80
                         border border-slate-800 hover:border-slate-700 text-slate-200 text-sm font-medium
                         rounded-xl transition-all cursor-pointer"
            >
              <Github className="w-4 h-4" />
              GitHub
            </button>
          </div>

          <p className="text-center text-sm text-slate-400 mt-2">
            Don&apos;t have an account?{" "}
            <Link href="/sign-up" className="text-indigo-400 hover:text-indigo-300 font-semibold transition-colors">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
