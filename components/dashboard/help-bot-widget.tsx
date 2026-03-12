"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, X, Send, Loader2, Sparkles, Calendar, Package, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const QUICK_PROMPTS = [
  { label: "Citas de hoy", icon: Calendar, text: "Dame un resumen de las citas agendadas para hoy" },
  { label: "Stock bajo", icon: Package, text: "¿Qué productos tienen poco stock disponible?" },
  { label: "Ayuda", icon: HelpCircle, text: "¿Qué puedo hacer con YD Social Ops?" },
];

interface HelpBotWidgetProps {
  tenantId?: string;
  planTier: string;
}

const ENTERPRISE_PLANS = ["enterprise", "enterprise_plus"];

export function HelpBotWidget({ tenantId, planTier }: HelpBotWidgetProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isEnterprise = ENTERPRISE_PLANS.includes(planTier);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([
        {
          role: "assistant",
          content: "¡Hola! Soy tu asistente interno. Puedo darte un resumen de citas, revisar stock de productos o responder dudas sobre la plataforma. ¿En qué te ayudo?",
        },
      ]);
    }
  }, [open, messages.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userMsg: Message = { role: "user", content: trimmed };
    const currentHistory = messages.filter((m) => m.role !== "assistant" || messages.indexOf(m) > 0);
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/internal/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: currentHistory,
        }),
      });

      const data = await res.json();
      const reply = data.reply || "Sin respuesta del asistente.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error al conectar con el asistente. Intenta nuevamente." },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  if (!isEnterprise) return null;

  return (
    <>
      {/* Floating button */}
      <Button
        size="icon"
        variant="ghost"
        onClick={() => setOpen(true)}
        title="Asistente interno"
        className="relative min-w-[36px] min-h-[36px]"
      >
        <Bot className="w-5 h-5" />
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:w-[420px] p-0 flex flex-col" showCloseButton={false}>
          {/* Header */}
          <SheetHeader className="px-4 py-3 border-b shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="rounded-full bg-primary/10 p-1.5">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <SheetTitle className="text-sm leading-tight">Asistente Interno</SheetTitle>
                  <p className="text-xs text-muted-foreground leading-tight">Enterprise · YD Social Ops</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">Enterprise</Badge>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setOpen(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </SheetHeader>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
              >
                {msg.role === "assistant" && (
                  <div className="rounded-full bg-primary/10 p-1 h-7 w-7 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5 text-primary" />
                  </div>
                )}
                <div
                  className={`
                    rounded-2xl px-3 py-2 text-sm max-w-[80%] leading-relaxed
                    ${msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
                      : "bg-muted text-foreground rounded-tl-sm"
                    }
                  `}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-2">
                <div className="rounded-full bg-primary/10 p-1 h-7 w-7 flex items-center justify-center shrink-0">
                  <Bot className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="bg-muted rounded-2xl rounded-tl-sm px-3 py-2 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Pensando…</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick prompts */}
          {messages.length <= 1 && (
            <div className="px-4 pb-2 flex flex-wrap gap-2 shrink-0">
              {QUICK_PROMPTS.map(({ label, icon: Icon, text }) => (
                <button
                  key={label}
                  onClick={() => sendMessage(text)}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 text-xs bg-muted hover:bg-muted/80 rounded-full px-3 py-1.5 transition-colors disabled:opacity-50"
                >
                  <Icon className="w-3 h-3" />
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="border-t px-4 py-3 shrink-0">
            <form
              onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
              className="flex gap-2"
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Escribe tu pregunta…"
                disabled={isLoading}
                className="flex-1 text-sm bg-muted rounded-full px-4 py-2 outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim() || isLoading}
                className="rounded-full shrink-0"
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
