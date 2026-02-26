"use client";

import { useState, useRef, useEffect } from "react";
import {
  Send,
  Bot,
  User,
  Loader2,
  Info,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import type { ChatChannel } from "@/types";

interface ChatMessage {
  id: string;
  role: "user" | "bot";
  content: string;
  timestamp: Date;
  metadata?: {
    intent?: string;
    provider?: string;
    tokens?: number;
    payment_link?: string;
  };
}

const CHANNEL_STYLES: Record<string, { bg: string; accent: string; label: string; icon: string }> = {
  whatsapp: { bg: "bg-[#0b141a]", accent: "bg-[#005c4b]", label: "WhatsApp", icon: "💬" },
  messenger: { bg: "bg-[#0a1128]", accent: "bg-[#0084ff]", label: "Messenger", icon: "💙" },
  tiktok: { bg: "bg-[#121212]", accent: "bg-[#ff0050]", label: "TikTok", icon: "🎵" },
  web: { bg: "bg-background", accent: "bg-primary", label: "Web Widget", icon: "🌐" },
};

export default function SimulatorPage() {
  const { tenant, tenantId } = useDashboard();
  const [channel, setChannel] = useState<ChatChannel>("web");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const style = CHANNEL_STYLES[channel] || CHANNEL_STYLES.web;

  // session_id persistente por tenant: mismo ID al cambiar de canal y al recargar
  const getOrCreateSessionId = (tid: string) => {
    if (typeof window === "undefined") return `sim_${tid}_${Date.now()}`;
    const key = `sim_session_${tid}`;
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = `sim_${tid}_${Date.now()}`;
      sessionStorage.setItem(key, id);
    }
    return id;
  };
  const sessionIdRef = useRef<string>("");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Nueva conversación solo al cambiar de tenant (no al cambiar de canal)
  // session_id persistente: misma conversación al alternar Web/WhatsApp/Messenger
  useEffect(() => {
    if (!tenantId) return;
    setMessages([]);
    sessionIdRef.current = getOrCreateSessionId(tenantId);
    if (tenant?.bot_welcome_message) {
      setMessages([{
        id: "welcome",
        role: "bot",
        content: tenant.bot_welcome_message,
        timestamp: new Date(),
      }]);
    }
  }, [tenantId]);

  // Si tenant carga después (async), añadir welcome cuando la sesión está vacía
  useEffect(() => {
    if (tenant?.bot_welcome_message && messages.length === 0) {
      setMessages([{
        id: "welcome",
        role: "bot",
        content: tenant.bot_welcome_message,
        timestamp: new Date(),
      }]);
    }
  }, [tenant?.bot_welcome_message]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading || !tenantId) return;

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const appUrl = window.location.origin;
      const res = await fetch(`${appUrl}/api/bot/${tenantId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg.content,
          session_id: sessionIdRef.current,
          user_identifier: `simulator_${channel}`,
          channel,
        }),
      });

      const data = await res.json();

      const botMsg: ChatMessage = {
        id: `bot_${Date.now()}`,
        role: "bot",
        content: data.message || data.error || "Sin respuesta",
        timestamp: new Date(),
        metadata: {
          intent: data.intent_detected,
          payment_link: data.payment_link,
        },
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: "bot",
          content: "Error de conexión. Verifica que el servidor esté corriendo.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="space-y-4">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <Zap className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" />
          <span className="truncate">Simulador de Bot</span>
        </h1>
        <p className="text-muted-foreground mt-1">
          Prueba tu bot como si fueras un cliente en cualquier canal
        </p>
      </div>

      {/* Channel selector */}
      <div className="flex gap-2 flex-wrap">
        {(Object.keys(CHANNEL_STYLES) as ChatChannel[]).map((ch) => {
          const s = CHANNEL_STYLES[ch];
          return (
            <button
              key={ch}
              onClick={() => setChannel(ch)}
              className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all flex items-center gap-2 ${
                channel === ch
                  ? "border-primary bg-primary/10 shadow-sm"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <span>{s.icon}</span>
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Chat area */}
        <div className="lg:col-span-3">
          <Card className="overflow-hidden">
            {/* Chat header */}
            <div className={`px-4 py-3 ${style.accent} text-white flex items-center gap-3`}>
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-medium">{tenant?.bot_name || "Bot"}</p>
                <p className="text-xs opacity-75">
                  {style.label} — {tenant?.business_name || "Mi negocio"}
                </p>
              </div>
              <Badge variant="secondary" className="ml-auto text-xs bg-white/20 text-white border-0">
                Simulador
              </Badge>
            </div>

            {/* Messages */}
            <div className={`h-[min(450px,70vh)] min-h-[280px] overflow-y-auto p-4 space-y-3 ${channel !== "web" ? style.bg : ""}`}>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                      msg.role === "user"
                        ? channel === "whatsapp"
                          ? "bg-[#005c4b] text-white"
                          : channel === "messenger"
                            ? "bg-[#0084ff] text-white"
                            : channel === "tiktok"
                              ? "bg-[#ff0050] text-white"
                              : "bg-primary text-primary-foreground"
                        : channel !== "web"
                          ? "bg-white/10 text-white"
                          : "bg-muted"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] ${msg.role === "user" || channel !== "web" ? "opacity-60" : "text-muted-foreground"}`}>
                        {msg.timestamp.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {msg.metadata?.intent && (
                        <Badge variant="outline" className={`text-[9px] h-4 ${channel !== "web" ? "border-white/30 text-white/60" : ""}`}>
                          {msg.metadata.intent}
                        </Badge>
                      )}
                    </div>
                    {msg.metadata?.payment_link && (
                      <a
                        href={msg.metadata.payment_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block mt-2 text-xs underline opacity-80"
                      >
                        Abrir link de pago
                      </a>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className={`rounded-2xl px-4 py-3 ${channel !== "web" ? "bg-white/10" : "bg-muted"}`}>
                    <Loader2 className={`w-4 h-4 animate-spin ${channel !== "web" ? "text-white/60" : "text-muted-foreground"}`} />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={sendMessage} className="flex gap-2 p-3 border-t">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Escribe un mensaje..."
                disabled={loading}
                className="flex-1"
                autoFocus
              />
              <Button type="submit" size="icon" disabled={loading || !input.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </Card>
        </div>

        {/* Info panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Info className="w-4 h-4" />
                Configuración activa
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Canal</span>
                <Badge variant="outline">{style.label}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Negocio</span>
                <span className="font-medium capitalize">{tenant?.business_type || "products"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tono</span>
                <span className="font-medium capitalize">{tenant?.bot_tone || "amigable"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Contacto</span>
                <span className="font-medium text-right truncate max-w-[120px]">
                  {tenant?.contact_action === "whatsapp_contact"
                    ? "WhatsApp"
                    : tenant?.contact_action === "email_contact"
                      ? "Email"
                      : tenant?.contact_action === "custom_message"
                        ? "Custom"
                        : "Link pago"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bot</span>
                <span className="font-medium">{tenant?.bot_name || "Asistente"}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="w-4 h-4" />
                Mensajes de prueba
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {[
                "Hola, ¿qué ofrecen?",
                "¿Cuánto cuesta?",
                "Quiero comprar",
                "¿Tienen disponibilidad?",
                "¿Cómo puedo pagar?",
              ].map((msg) => (
                <button
                  key={msg}
                  className="w-full text-left text-xs px-3 py-2 rounded-md border hover:bg-muted transition-colors"
                  onClick={() => {
                    setInput(msg);
                    inputRef.current?.focus();
                  }}
                >
                  {msg}
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
