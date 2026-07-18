"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { processTaskCommand } from "./actions/ai";
import { CheckCircle2, Circle, Trash2, Plus, Tags, Folder, Layers, Mic, MicOff, Send, Sparkles } from "lucide-react";

const SYSTEM_CATEGORIES = ["Personal", "Work", "Errands", "Fitness", "Urgent"];

export default function DashboardPage() {
  const [taskInput, setTaskInput] = useState("");
  const [aiInput, setAiInput] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Personal");
  const [activeFilterTab, setActiveFilterTab] = useState("All");
  const [aiFeedback, setAiFeedback] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const recognitionRef = useRef<any>(null);

  const todos = useQuery(api.todos.getTodos);
  const createTodo = useMutation(api.todos.addTodo);
  const updateTodoStatus = useMutation(api.todos.toggleTodo);
  const removeTodo = useMutation(api.todos.deleteTodo);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = "en-US";

        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);
        recognition.onerror = () => setIsListening(false);
        recognition.onresult = async (event: any) => {
          const speechTranscript = event.results[0][0].transcript;
          setAiInput(speechTranscript);
          await triggerAiOrchestration(speechTranscript);
        };
        recognitionRef.current = recognition;
      }
    }
  }, [todos]);

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

  const triggerAiOrchestration = async (commandString: string) => {
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
          const matchedItem = todos.find(t => t._id === data || t.text.toLowerCase().includes(commandString.toLowerCase()));
          if (matchedItem) await updateTodoStatus({ id: matchedItem._id, isCompleted: !matchedItem.isCompleted });
        } else if (action === "DELETE" && data) {
          const matchedItem = todos.find(t => t._id === data || t.text.toLowerCase().includes(commandString.toLowerCase()));
          if (matchedItem) await removeTodo({ id: matchedItem._id });
        }
      } catch (mutateErr) {
        console.error("Mutation Sync Error:", mutateErr);
      }
      setAiInput("");
    } else {
      setAiFeedback("Could not parse command. Try rephrasing.");
    }
  };

  const handleManualAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskInput.trim()) return;
    await createTodo({ text: taskInput.trim(), category: selectedCategory as any });
    setTaskInput("");
  };

  const filteredTaskList = todos?.filter((t) => activeFilterTab === "All" || t.category === activeFilterTab) || [];

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-white shadow-xl relative overflow-hidden border-x border-slate-100">
      <header className="pt-10 pb-4 px-5 bg-gradient-to-br from-slate-900 to-slate-950 text-white shadow-sm shrink-0">
        <h1 className="text-xl font-bold tracking-tight">Surf ToDo Workbench</h1>
        <p className="text-indigo-400 text-[10px] font-semibold flex items-center gap-1 mt-0.5">
          <Sparkles className="w-2.5 h-2.5 fill-indigo-400" />
          Gemini Real-Time Processing Active
        </p>
      </header>

      <nav className="flex gap-1.5 p-3 overflow-x-auto bg-slate-50 border-b scrollbar-none shrink-0">
        <button
          onClick={() => setActiveFilterTab("All")}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1 shrink-0 transition-colors ${
            activeFilterTab === "All" ? "bg-indigo-600 text-white" : "bg-white border text-slate-600"
          }`}
        >
          <Layers className="w-3 h-3" /> All
        </button>
        {SYSTEM_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveFilterTab(cat)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1 shrink-0 transition-colors ${
              activeFilterTab === cat ? "bg-indigo-600 text-white" : "bg-white border text-slate-600"
            }`}
          >
            <Folder className="w-3 h-3" /> {cat}
          </button>
        ))}
      </nav>

      {aiFeedback && (
        <div className="bg-indigo-50/80 backdrop-blur-xs border-b border-indigo-100 px-5 py-2 text-[10px] font-semibold text-indigo-700 flex justify-between items-center shrink-0 animate-fade-in">
          <span>{aiFeedback}</span>
          <button onClick={() => setAiFeedback("")} className="text-indigo-400 font-bold hover:text-indigo-600 px-1">✕</button>
        </div>
      )}

      <main className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 bg-slate-50/40">
        {todos === undefined ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-[10px] text-slate-400 font-medium">Connecting to server data pipeline...</p>
          </div>
        ) : filteredTaskList.length === 0 ? (
          <div className="text-center py-16 border border-dashed rounded-xl bg-white p-6 text-xs text-slate-400">
            No active to-do items found in this category.
          </div>
        ) : (
          filteredTaskList.map((todo) => (
            <div key={todo._id} className={`flex items-center justify-between p-3.5 bg-white rounded-xl border border-slate-100 shadow-xs transition-opacity active:scale-[0.99] ${todo.isCompleted ? "opacity-55" : ""}`}>
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <button onClick={() => updateTodoStatus({ id: todo._id, isCompleted: !todo.isCompleted })} className="mt-0.5 shrink-0 text-slate-300">
                  {todo.isCompleted ? <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500 fill-emerald-50" /> : <Circle className="w-4.5 h-4.5" />}
                </button>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className={`text-xs break-words leading-tight ${todo.isCompleted ? "line-through text-slate-400" : "text-slate-800 font-medium"}`}>{todo.text}</span>
                  <span className="inline-flex max-w-max px-1.5 py-0.5 rounded text-[8px] font-bold bg-slate-100 text-slate-400 tracking-wide uppercase">{todo.category}</span>
                </div>
              </div>
              <button onClick={() => removeTodo({ id: todo._id })} className="text-slate-300 hover:text-rose-600 p-1 shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </main>

      <footer className="border-t border-slate-100 bg-white p-3.5 space-y-2.5 shadow-2xl shrink-0">
        <form onSubmit={handleManualAddSubmit} className="space-y-2">
          <div className="flex gap-1 items-center bg-slate-50 p-0.5 rounded-lg overflow-x-auto border text-[10px] scrollbar-none">
            <Tags className="w-3 h-3 text-slate-400 mx-1.5 shrink-0" />
            {SYSTEM_CATEGORIES.map(cat => (
              <button key={cat} type="button" onClick={() => setSelectedCategory(cat)} className={`px-2.5 py-0.5 rounded-md font-bold transition-all ${selectedCategory === cat ? "bg-white shadow-xs border text-slate-900" : "text-slate-400"}`}>
                {cat}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input type="text" value={taskInput} onChange={e => setTaskInput(e.target.value)} placeholder="Fast append a task..." className="flex-1 px-3 py-2 bg-slate-50 border rounded-xl text-xs focus:outline-none focus:border-indigo-500 focus:bg-white text-slate-800 placeholder:text-slate-400" />
            <button type="submit" disabled={!taskInput.trim()} className="bg-slate-900 disabled:bg-slate-100 text-white px-3.5 rounded-xl text-xs font-semibold flex items-center justify-center transition-all"><Plus className="w-4 h-4" /></button>
          </div>
        </form>

        <div className="relative flex items-center py-0.5"><div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-100" /></div><div className="relative flex justify-center w-full text-[8px] font-bold uppercase tracking-widest"><span className="bg-white px-2 text-slate-300">Intelligent Voice & Chat Console</span></div></div>

        <div className="flex gap-2 items-center">
          <button
            type="button"
            onClick={handleVoiceToggleInput}
            className={`p-2.5 rounded-xl transition-all border flex items-center justify-center shrink-0 ${
              isListening ? "bg-rose-50 border-rose-200 text-rose-600 animate-pulse" : "bg-indigo-50 border-indigo-100 text-indigo-600"
            }`}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          
          <div className="relative flex-1">
            <input
              type="text"
              value={aiInput}
              onChange={e => setAiInput(e.target.value)}
              onKeyDown={async e => e.key === "Enter" && !isAiLoading && await triggerAiOrchestration(aiInput)}
              placeholder={isAiLoading ? "Processing command..." : "Tell Gemini to Add, Check, or Delete..."}
              disabled={isAiLoading}
              className="w-full pl-3 pr-9 py-2.5 bg-indigo-50/40 border border-indigo-100/80 rounded-xl text-xs focus:outline-none focus:border-indigo-400 focus:bg-white text-slate-800 placeholder:text-slate-400"
            />
            <button
              onClick={() => triggerAiOrchestration(aiInput)}
              disabled={isAiLoading || !aiInput.trim()}
              className="absolute right-2 top-1.5 p-1 text-indigo-500 disabled:text-slate-300 hover:text-indigo-700 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}