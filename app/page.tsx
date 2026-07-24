"use client";

import Link from "next/link";
import { useConvexAuth } from "convex/react";
import { Sparkles, Mic, Folder, Zap, ShieldCheck, ArrowRight, LogIn } from "lucide-react";

const FEATURES = [
  {
    icon: Zap,
    title: "Real-time sync",
    description: "Tasks update instantly across all your devices.",
  },
  {
    icon: Folder,
    title: "Smart categories",
    description: "Personal, Work, Errands, Fitness and Urgent — organized out of the box.",
  },
  {
    icon: Mic,
    title: "Gemini voice & chat",
    description: "Tell Gemini to add, check off, or delete tasks — hands free.",
  },
  {
    icon: ShieldCheck,
    title: "Private by default",
    description: "Your list is yours alone, secured with your own account.",
  },
];

export default function HomePage() {
  const { isAuthenticated } = useConvexAuth();

  return (
    <div className="flex flex-col min-h-screen max-w-md mx-auto bg-white shadow-xl relative overflow-hidden border-x border-slate-100">
      <header className="pt-14 pb-10 px-6 bg-gradient-to-br from-slate-900 to-slate-950 text-white shrink-0">
        <p className="text-indigo-400 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1">
          <Sparkles className="w-3 h-3 fill-indigo-400" />
          Gemini-powered to-do canvas
        </p>
        <h1 className="text-3xl font-bold tracking-tight mt-2 leading-tight">
          Surf ToDo<br />Workbench
        </h1>
        <p className="text-slate-400 text-xs mt-3 leading-relaxed">
          The mobile-first task canvas that keeps your day in sync — type it, say it, done.
        </p>
      </header>

      <main className="flex-1 px-6 py-6 bg-slate-50/40 space-y-2.5">
        {FEATURES.map((feature) => (
          <div
            key={feature.title}
            className="flex items-start gap-3 p-3.5 bg-white rounded-xl border border-slate-100 shadow-xs"
          >
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
              <feature.icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xs font-bold text-slate-800">{feature.title}</h2>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{feature.description}</p>
            </div>
          </div>
        ))}
      </main>

      <footer className="border-t border-slate-100 bg-white p-5 space-y-2.5 shadow-2xl shrink-0">
        {isAuthenticated ? (
          <Link
            href="/dashboard"
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white rounded-xl px-4 py-3 text-xs font-bold transition-all active:scale-[0.99] hover:bg-indigo-700"
          >
            Open your dashboard <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        ) : (
          <>
            <Link
              href="/signin?mode=signup"
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white rounded-xl px-4 py-3 text-xs font-bold transition-all active:scale-[0.99] hover:bg-indigo-700"
            >
              Create a free account <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              href="/signin"
              className="w-full flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-700 rounded-xl px-4 py-3 text-xs font-semibold transition-all active:scale-[0.99] hover:bg-slate-50"
            >
              <LogIn className="w-3.5 h-3.5" /> Sign in
            </Link>
            <p className="text-center text-[9px] text-slate-400 font-medium pt-1">
              Free forever · Google or email sign-in · No credit card
            </p>
          </>
        )}
      </footer>
    </div>
  );
}
