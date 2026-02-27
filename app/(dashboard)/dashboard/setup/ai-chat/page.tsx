"use client";

import { useState, useRef, useEffect, forwardRef } from "react";
import { useRouter } from "next/navigation";
import { Bot, Send, User, ChevronLeft, Sparkles, Loader2, ArrowRight, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { processSetupChat } from "@/actions/setup-actions";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import { toast } from "sonner";
import type { AIMessage } from "@/lib/ai-providers";

export default function SetupAiChatPage() {
    const router = useRouter();
    const { tenant } = useDashboard();
    const [messages, setMessages] = useState<AIMessage[]>([
        {
            role: "assistant",
            content: `¡Hola ${tenant?.business_name || "allí"}! Soy tu asistente de configuración. Estoy aquí para ayudarte a dejar tu bot listo para vender en pocos minutos. 

¿Cómo te gustaría empezar? Cuéntame un poco más sobre tu negocio o qué productos quieres vender.`,
        },
    ]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    const SUGGESTIONS = [
        "Configurar nombre y tipo de negocio",
        "Añadir productos o servicios",
        "Borrar todos los productos",
        "¿Cómo conecto WhatsApp?",
    ];

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    async function handleSend(msg?: string) {
        const text = (msg ?? input).trim();
        if (!text || isLoading) return;

        setInput("");
        setMessages((prev) => [...prev, { role: "user", content: text }]);
        setIsLoading(true);

        try {
            const tenantId = tenant?.id;
            if (!tenantId) {
                toast.error("No se detectó el tenant válido");
                return;
            }
            const result = await processSetupChat(tenantId, text, messages);
            setMessages(result.newHistory);
        } catch (error) {
            toast.error("Hubo un error al procesar tu mensaje");
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6 flex flex-col h-[calc(100vh-180px)]">
            <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard/setup")}>
                        <ChevronLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h1 className="text-xl font-bold flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-primary" />
                            Asistente IA
                        </h1>
                        <p className="text-sm text-muted-foreground">Configura tu negocio chateando</p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/channels")}>
                        <Share2 className="w-4 h-4 mr-2" />
                        Conectar canales
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/channels/simulator")}>
                        Probar Bot
                        <ArrowRight className="ml-2 w-4 h-4" />
                    </Button>
                </div>
            </div>

            <Card className="flex-1 flex flex-col overflow-hidden border-primary/20 bg-gradient-to-b from-background to-muted/20">
                <ScrollArea ref={scrollRef} className="flex-1 p-4 space-y-4">
                    <div className="space-y-4 pr-4">
                        {messages.map((m, i) => (
                            <div
                                key={i}
                                className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}
                            >
                                <div
                                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${m.role === "assistant" ? "bg-primary text-primary-foreground border-primary" : "bg-muted border-border"
                                        }`}
                                >
                                    {m.role === "assistant" ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                                </div>
                                <div
                                    className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm shadow-sm ${m.role === "assistant"
                                        ? "bg-white text-foreground border border-border"
                                        : "bg-primary text-primary-foreground"
                                        }`}
                                >
                                    <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex gap-3">
                                <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 border border-primary animate-pulse">
                                    <Bot className="w-4 h-4" />
                                </div>
                                <div className="bg-white border border-border rounded-2xl px-4 py-3 shadow-sm flex items-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                    <span className="text-xs text-muted-foreground">Pensando e integrando cambios...</span>
                                </div>
                            </div>
                        )}
                    </div>
                </ScrollArea>

                <CardContent className="p-4 border-t bg-background shrink-0 space-y-3">
                    <p className="text-xs text-muted-foreground">
                        Puedo ayudarte con: configurar tu negocio, añadir o borrar productos, y guiarte para conectar WhatsApp.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {SUGGESTIONS.map((s) => (
                            <button
                                key={s}
                                type="button"
                                onClick={() => handleSend(s)}
                                disabled={isLoading}
                                className="text-xs px-3 py-1.5 rounded-full border border-border bg-muted/50 hover:bg-muted transition-colors disabled:opacity-50 disabled:pointer-events-none"
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            handleSend();
                        }}
                        className="flex gap-2 items-end"
                    >
                        <Textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Escribe aquí... Por ejemplo: mi negocio es una tienda de ropa, quiero añadir estos productos..."
                            disabled={isLoading}
                            rows={4}
                            className="min-h-[80px] sm:min-h-[100px] max-h-[280px] resize-y flex-1"
                        />
                        <Button type="submit" disabled={isLoading || !input.trim()} size="icon" className="shrink-0 h-10 w-10">
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </Button>
                    </form>
                    <p className="text-[10px] text-center text-muted-foreground">
                        Enter para enviar · Shift+Enter para nueva línea
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}

const ScrollArea = forwardRef<HTMLDivElement, { children: React.ReactNode; className?: string }>(
    function ScrollArea({ children, className }, ref) {
        return (
            <div ref={ref} className={`overflow-y-auto ${className}`}>
                {children}
            </div>
        );
    }
);
