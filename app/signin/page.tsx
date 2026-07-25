"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Sparkles, Mail, Lock, LogIn, UserPlus } from "lucide-react";

function SignInForm() {
  const { signIn } = useAuthActions();
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<"signIn" | "signUp">(
    searchParams.get("mode") === "signup" ? "signUp" : "signIn"
  );
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Already signed in? Go straight to the dashboard.
  useEffect(() => {
    if (!isAuthLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthLoading, isAuthenticated, router]);

  const handlePasswordSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);
    try {
      await signIn("password", formData);
      router.push("/dashboard");
    } catch {
      setError(
        step === "signIn"
          ? "Invalid email or password. Please try again."
          : "Could not create account. Try a different email or a stronger password (8+ characters)."
      );
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
          <button
            type="button"
            onClick={() => void signIn("google", { redirectTo: "/dashboard" })}
            className="w-full flex items-center justify-center gap-2.5 bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 active:scale-[0.99] transition-all"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
              />
            </svg>
            Continue with Google
          </button>

          <div className="relative flex items-center py-0.5">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center w-full text-[8px] font-bold uppercase tracking-widest">
              <span className="bg-slate-50 px-2 text-slate-400">or with email</span>
            </div>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-2.5">
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
              <input
                name="email"
                type="email"
                required
                placeholder="Email address"
                autoComplete="email"
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-indigo-500 text-slate-800 placeholder:text-slate-400"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
              <input
                name="password"
                type="password"
                required
                minLength={8}
                placeholder={step === "signIn" ? "Password" : "Password (8+ characters)"}
                autoComplete={step === "signIn" ? "current-password" : "new-password"}
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-indigo-500 text-slate-800 placeholder:text-slate-400"
              />
            </div>
            <input name="flow" type="hidden" value={step} />

            {error && (
              <p className="text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 bg-slate-900 disabled:bg-slate-300 text-white rounded-xl px-4 py-2.5 text-xs font-semibold transition-all active:scale-[0.99]"
            >
              {step === "signIn" ? <LogIn className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
              {isSubmitting ? "Please wait..." : step === "signIn" ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className="text-center text-[10px] text-slate-400 font-medium">
            {step === "signIn" ? "New to Surf ToDo?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => {
                setStep(step === "signIn" ? "signUp" : "signIn");
                setError("");
              }}
              className="text-indigo-600 font-bold hover:text-indigo-700"
            >
              {step === "signIn" ? "Create an account" : "Sign in instead"}
            </button>
          </p>
    </div>
  );
}

export default function SignInPage() {
  return (
    <div className="flex flex-col h-dvh max-w-md mx-auto bg-white shadow-xl relative overflow-hidden border-x border-slate-100">
      <header className="pt-[max(1.5rem,env(safe-area-inset-top))] pb-4 px-5 bg-gradient-to-br from-slate-900 to-slate-950 text-white shadow-sm shrink-0">
        <h1 className="text-xl font-bold tracking-tight">Surf ToDo Workbench</h1>
        <p className="text-indigo-400 text-[10px] font-semibold flex items-center gap-1 mt-0.5">
          <Sparkles className="w-2.5 h-2.5 fill-indigo-400" />
          Sign in to sync your tasks
        </p>
      </header>

      <main className="flex-1 overflow-y-auto px-5 py-8 bg-slate-50/40">
        <Suspense
          fallback={
            <div className="flex items-center justify-center gap-2 py-8">
              <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-[10px] text-slate-400 font-medium">Loading sign-in...</p>
            </div>
          }
        >
          <SignInForm />
        </Suspense>
      </main>
    </div>
  );
}
