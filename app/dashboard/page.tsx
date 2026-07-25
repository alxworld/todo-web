"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { processTaskCommand } from "../actions/ai";
import {
  CheckCircle2, Circle, Trash2, Plus, Layers, Mic, MicOff, Send,
  Sparkles, LogOut, ClipboardList,
} from "lucide-react";

const SYSTEM_CATEGORIES = ["Personal", "Work", "Errands", "Fitness", "Urgent"] as const;
type Category = (typeof SYSTEM_CATEGORIES)[number];

const CATEGORY_BADGE: Record<Category, string> = {
  Personal: "bg-indigo-50 text-indigo-600",
  Work: "bg-sky-50 text-sky-600",
  Errands: "bg-amber-50 text-amber-700",
  Fitness: "bg-emerald-50 text-emerald-600",
  Urgent: "bg-rose-50 text-rose-600",
};

interface SpeechRecognitionResultEvent {
  results: { [index: number]: { [index: number]: { transcript: string } } };
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  start: () => void;
  stop: () => void;
}

export default function DashboardPage() {
  const [taskInput, setTaskInput] = useState("");
  const [aiInput, setAiInput] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<Category>("Personal");
  const [activeFilterTab, setActiveFilterTab] = useState("All");
  const [aiFeedback, setAiFeedback] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();

  const todos = useQuery(api.todos.getTodos, isAuthenticated ? {} : "skip");
  const createTodo = useMutation(api.todos.addTodo);
  const updateTodoStatus = useMutation(api.todos.toggleTodo);
  const removeTodo = useMutation(api.todos.deleteTodo);

  const triggerAiOrchestration = useCallback(async (commandString: string) => {
    if (!commandString.trim() || !todos) return;
    setIsAiLoading(true);
    setAiFeedback("AI analyzing...");

    const result = await processTaskCommand(commandString, todos);
    setIsAiLoading(false);

    if (result.success && result.payload) {
      const { action, data, feedback } = result.payload;
      setAiFeedback(feedback || "Processed successfully.");

      try {
        if (action === "ADD" && data?.text) {
          await createTodo({ text: data.text, category: data.category || "Personal" });
        } else if (action === "TOGGLE" && data) {
          const matchedItem = todos.find(
            (t) => t._id === data || t.text.toLowerCase().includes(commandString.toLowerCase())
          );
          if (matchedItem) await updateTodoStatus({ id: matchedItem._id, isCompleted: !matchedItem.isCompleted });
        } else if (action === "DELETE" && data) {
          const matchedItem = todos.find(
            (t) => t._id === data || t.text.toLowerCase().includes(commandString.toLowerCase())
          );
          if (matchedItem) await removeTodo({ id: matchedItem._id });
        }
      } catch (mutateErr) {
        console.error("Mutation Sync Error:", mutateErr);
      }
      setAiInput("");
    } else {
      setAiFeedback("Could not parse command. Try rephrasing.");
    }
  }, [todos, createTodo, updateTodoStatus, removeTodo]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognitionCtor =
        (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionInstance; webkitSpeechRecognition?: new () => SpeechRecognitionInstance })
          .SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionInstance }).webkitSpeechRecognition;
      if (SpeechRecognitionCtor) {
        const recognition = new SpeechRecognitionCtor();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = "en-US";

        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);
        recognition.onerror = () => setIsListening(false);
        recognition.onresult = (event: SpeechRecognitionResultEvent) => {
          const speechTranscript = event.results[0][0].transcript;
          setAiInput(speechTranscript);
          void triggerAiOrchestration(speechTranscript);
        };
        recognitionRef.current = recognition;
      }
    }
  }, [triggerAiOrchestration]);

  const handleVoiceToggleInput = () => {
    if (!recognitionRef.current) {
      alert("Voice input is unsupported on this mobile browser version.");
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      setAiFeedback("Listening...");
      recognitionRef.current.start();
    }
  };

  const handleManualAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskInput.trim()) return;
    await createTodo({ text: taskInput.trim(), category: selectedCategory });
    setTaskInput("");
  };

  const filteredTaskList = todos?.filter((t) => activeFilterTab === "All" || t.category === activeFilterTab) || [];
  const openCount = todos?.filter((t) => !t.isCompleted).length ?? 0;

  const router = useRouter();

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.replace("/signin");
    }
  }, [isAuthLoading, isAuthenticated, router]);

  if (isAuthLoading || !isAuthenticated) {
    return (
      <div className="flex flex-col h-dvh max-w-md mx-auto bg-white shadow-xl relative overflow-hidden border-x border-slate-100 items-center justify-center gap-2">
        <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-[10px] text-slate-400 font-medium">Restoring your session...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-dvh max-w-md mx-auto bg-white shadow-xl relative overflow-hidden border-x border-slate-100">
      {/* ── Compact header ─────────────────────────────────────────── */}
      <header className="px-4 pb-3 pt-[max(0.875rem,env(safe-area-inset-top))] bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 text-white shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-lg bg-indigo-500/15 border border-indigo-400/20 shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
            </div>
            <div className="min-w-0">
              <h1 className="text-[15px] font-bold tracking-tight leading-tight truncate">Surf ToDo</h1>
              <p className="text-indigo-400/80 text-[9px] font-semibold tracking-wider uppercase leading-tight">
                Gemini realtime active
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="px-2 py-1 rounded-full bg-white/10 border border-white/5 text-[9px] font-bold tracking-wide">
              {openCount} open
            </span>
            <button
              onClick={() => void signOut()}
              title="Sign out"
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Category filter pills ──────────────────────────────────── */}
      <nav className="flex gap-1.5 px-3 py-2 overflow-x-auto bg-slate-50/80 border-b border-slate-100 scrollbar-none shrink-0">
        {["All", ...SYSTEM_CATEGORIES].map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveFilterTab(cat)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-semibold flex items-center gap-1 shrink-0 transition-all active:scale-95 ${
              activeFilterTab === cat
                ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200"
                : "bg-white border border-slate-200/80 text-slate-500 hover:text-slate-700"
            }`}
          >
            {cat === "All" && <Layers className="w-3 h-3" />}
            {cat}
          </button>
        ))}
      </nav>

      {/* ── AI feedback toast ──────────────────────────────────────── */}
      {aiFeedback && (
        <div className="bg-indigo-50/90 backdrop-blur-xs border-b border-indigo-100 px-4 py-1.5 text-[10px] font-semibold text-indigo-700 flex justify-between items-center shrink-0">
          <span className="flex items-center gap-1.5 min-w-0">
            <Sparkles className="w-3 h-3 shrink-0" />
            <span className="truncate">{aiFeedback}</span>
          </span>
          <button onClick={() => setAiFeedback("")} className="text-indigo-400 font-bold hover:text-indigo-600 px-1 shrink-0">✕</button>
        </div>
      )}

      {/* ── Task list ──────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto px-3 py-2.5 space-y-2 bg-slate-50/40">
        {todos === undefined ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-[10px] text-slate-400 font-medium">Syncing your tasks...</p>
          </div>
        ) : filteredTaskList.length === 0 ? (
          <div className="flex flex-col items-center text-center py-14 px-6 border border-dashed border-slate-200 rounded-2xl bg-white gap-2.5">
            <div className="p-3 rounded-full bg-indigo-50 text-indigo-400">
              <ClipboardList className="w-5 h-5" />
            </div>
            <p className="text-xs font-semibold text-slate-600">All clear here</p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              No tasks in this category. Add one below — or just tell Gemini.
            </p>
          </div>
        ) : (
          filteredTaskList.map((todo) => (
            <div
              key={todo._id}
              className={`group flex items-center justify-between gap-2 pl-2 pr-1.5 py-2 bg-white rounded-2xl border shadow-xs transition-all active:scale-[0.99] ${
                todo.isCompleted ? "border-slate-100 opacity-50" : "border-slate-200/70 hover:border-indigo-200 hover:shadow-sm"
              }`}
            >
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <button
                  onClick={() => updateTodoStatus({ id: todo._id, isCompleted: !todo.isCompleted })}
                  aria-label={todo.isCompleted ? "Mark as not done" : "Mark as done"}
                  className="p-1.5 shrink-0 text-slate-300 hover:text-indigo-500 transition-colors"
                >
                  {todo.isCompleted ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 fill-emerald-50" />
                  ) : (
                    <Circle className="w-5 h-5" />
                  )}
                </button>
                <div className="flex flex-col gap-1 min-w-0 py-0.5">
                  <span className={`text-[13px] break-words leading-snug ${todo.isCompleted ? "line-through text-slate-400" : "text-slate-800 font-medium"}`}>
                    {todo.text}
                  </span>
                  <span className={`inline-flex max-w-max px-1.5 py-0.5 rounded-md text-[8px] font-bold tracking-wide uppercase ${CATEGORY_BADGE[todo.category as Category] ?? "bg-slate-100 text-slate-500"}`}>
                    {todo.category}
                  </span>
                </div>
              </div>
              <button
                onClick={() => removeTodo({ id: todo._id })}
                aria-label="Delete task"
                className="p-2 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </main>

      {/* ── Composer (always visible) ──────────────────────────────── */}
      <footer className="border-t border-slate-100 bg-white/95 backdrop-blur px-3 pt-2 pb-[max(0.625rem,env(safe-area-inset-bottom))] space-y-2 shrink-0">
        <form onSubmit={handleManualAddSubmit} className="space-y-1.5">
          <div className="flex gap-1 items-center overflow-x-auto scrollbar-none">
            {SYSTEM_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold shrink-0 transition-all active:scale-95 ${
                  selectedCategory === cat
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-400 hover:text-slate-600"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              placeholder="Add a task..."
              className="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs focus:outline-none focus:border-indigo-400 focus:bg-white text-slate-800 placeholder:text-slate-400 transition-colors"
            />
            <button
              type="submit"
              disabled={!taskInput.trim()}
              aria-label="Add task"
              className="w-9 shrink-0 bg-slate-900 disabled:bg-slate-200 text-white disabled:text-slate-400 rounded-xl flex items-center justify-center transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </form>

        {/* ── Gemini voice & chat bar ──────────────────────────────── */}
        <div className={`flex gap-1 items-center rounded-xl border p-1 transition-colors ${
          isListening ? "border-rose-200 bg-rose-50/50" : "border-indigo-100 bg-gradient-to-r from-indigo-50/70 to-violet-50/50"
        }`}>
          <button
            type="button"
            onClick={handleVoiceToggleInput}
            aria-label={isListening ? "Stop listening" : "Start voice input"}
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all active:scale-95 ${
              isListening
                ? "bg-rose-500 text-white animate-pulse"
                : "bg-white text-indigo-600 border border-indigo-100 shadow-xs"
            }`}
          >
            {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
          </button>
          <input
            type="text"
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            onKeyDown={async (e) => e.key === "Enter" && !isAiLoading && (await triggerAiOrchestration(aiInput))}
            placeholder={isAiLoading ? "Gemini is thinking..." : "Ask Gemini to add, check, delete..."}
            disabled={isAiLoading}
            className="flex-1 min-w-0 px-2 py-1.5 bg-transparent text-xs focus:outline-none text-slate-800 placeholder:text-slate-400 disabled:opacity-60"
          />
          <button
            onClick={() => triggerAiOrchestration(aiInput)}
            disabled={isAiLoading || !aiInput.trim()}
            aria-label="Send to Gemini"
            className="w-8 h-8 rounded-lg bg-indigo-600 disabled:bg-transparent text-white disabled:text-slate-300 flex items-center justify-center shrink-0 transition-all active:scale-95"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </footer>
    </div>
  );
}
