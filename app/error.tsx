"use client";

import { useEffect } from "react";
import { TriangleAlert, RotateCcw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Route error:", error);
  }, [error]);

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-white shadow-xl relative overflow-hidden border-x border-slate-100 items-center justify-center gap-3 px-6">
      <div className="p-3 rounded-full bg-rose-50 text-rose-500">
        <TriangleAlert className="w-6 h-6" />
      </div>
      <h2 className="text-sm font-bold text-slate-800">Something went wrong</h2>
      <p className="text-[11px] text-slate-400 text-center leading-relaxed">
        The app hit an unexpected error. Please try again — if it persists, sign out and back in.
      </p>
      <button
        onClick={reset}
        className="flex items-center gap-2 bg-slate-900 text-white rounded-xl px-4 py-2.5 text-xs font-semibold transition-all active:scale-[0.99]"
      >
        <RotateCcw className="w-3.5 h-3.5" /> Try again
      </button>
    </div>
  );
}
