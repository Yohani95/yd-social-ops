/**
 * Sistema de proveedores de IA con fallback automático.
 *
 * Orden de prioridad:
 * 1. Proveedor configurado en AI_PROVIDER (.env.local)
 * 2. Si falla (cuota, error) → fallback al siguiente proveedor automáticamente
 *
 * Groq (llama-3.3-70b): GRATIS, 6k tokens/min, 500k/día — recomendado para desarrollo
 * Gemini Flash: 1,500 req/día gratis (requiere billing habilitado en GCP)
 * OpenAI GPT-4o-mini: ~$0.15/1M tokens input
 */

import OpenAI from "openai";
import Groq from "groq-sdk";
import { GoogleGenAI, Type } from "@google/genai";

// ============================================================
// Tipos unificados (independientes del proveedor)
// ============================================================

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AITool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AIToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AIResponse {
  content: string;
  toolCalls?: AIToolCall[];
  provider: "openai" | "gemini" | "groq";
  tokensUsed: number;
  /** Modelo usado (ej. para Groq fallback, pasar el mismo en callAIWithToolResult) */
  modelUsed?: string;
}

// ============================================================
// PROVEEDOR: OpenAI
// ============================================================

async function callOpenAI(
  messages: AIMessage[],
  tools?: AITool[]
): Promise<AIResponse> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = messages.map(
    (m) => ({ role: m.role, content: m.content })
  );

  const options: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
    model: "gpt-4o-mini",
    messages: openaiMessages,
    temperature: 0.7,
    max_tokens: 800,
    ...(tools && tools.length > 0 && {
      tools: tools.map((t) => ({
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      })),
      tool_choice: "auto" as const,
    }),
  };

  const completion = await client.chat.completions.create(options);
  const message = completion.choices[0].message;

  const toolCalls: AIToolCall[] = (message.tool_calls || []).map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: JSON.parse(tc.function.arguments),
  }));

  return {
    content: message.content || "",
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    provider: "openai",
    tokensUsed: completion.usage?.total_tokens || 0,
  };
}

// Segunda vuelta de OpenAI (tras ejecutar tool)
async function callOpenAIWithToolResult(
  messages: AIMessage[],
  assistantMessage: OpenAI.Chat.ChatCompletionMessage,
  toolCallId: string,
  toolResult: string
): Promise<AIResponse> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      ...messages.map((m) => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      })),
      assistantMessage,
      { role: "tool", tool_call_id: toolCallId, content: toolResult },
    ],
    temperature: 0.7,
    max_tokens: 800,
  });

  return {
    content: completion.choices[0].message.content || "",
    provider: "openai",
    tokensUsed: completion.usage?.total_tokens || 0,
  };
}

// ============================================================
// PROVEEDOR: Groq (OpenAI-compatible, gratis en desarrollo)
// Fallback entre modelos: si el principal falla (429), prueba con más cuota
// ============================================================

/** Modelos Groq de respaldo cuando el principal alcanza cuota (429) */
const GROQ_FALLBACK_MODELS = [
  "llama-3.1-8b-instant",  // 14.4K RPD
  "allam-2-7b",           // 7K RPD
] as const;

function getGroqModelsToTry(): string[] {
  const primary = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const fallbacks = GROQ_FALLBACK_MODELS.filter((m) => m !== primary);
  return [primary, ...fallbacks];
}

function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.includes("quota")
  );
}

async function callGroqWithModel(
  messages: AIMessage[],
  model: string,
  tools?: AITool[]
): Promise<AIResponse> {
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const groqMessages = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const completion = await client.chat.completions.create({
    model,
    messages: groqMessages,
    temperature: 0.7,
    max_tokens: 800,
    ...(tools && tools.length > 0 && {
      tools: tools.map((t) => ({
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      })),
      tool_choice: "auto" as const,
    }),
  });
  const message = completion.choices[0].message;

  const rawCalls = message.tool_calls || [];
  const toolCalls: AIToolCall[] = rawCalls.map((tc: { id: string; function: { name: string; arguments: string } }) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: JSON.parse(tc.function.arguments),
  }));

  return {
    content: message.content || "",
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    provider: "groq",
    tokensUsed: completion.usage?.total_tokens || 0,
    modelUsed: model,
  };
}

async function callGroq(
  messages: AIMessage[],
  tools?: AITool[]
): Promise<AIResponse> {
  let lastError: unknown;
  for (const model of getGroqModelsToTry()) {
    try {
      const result = await callGroqWithModel(messages, model, tools);
      if (result.modelUsed) {
        console.info(`[AI] Groq usando modelo: ${result.modelUsed}`);
      }
      return result;
    } catch (err) {
      lastError = err;
      if (isRateLimitError(err)) {
        console.warn(`[AI] Groq modelo ${model} sin cuota, probando siguiente...`);
      } else {
        throw err;
      }
    }
  }
  throw lastError;
}

async function callGroqWithToolResult(
  messages: AIMessage[],
  assistantMessage: Parameters<Groq["chat"]["completions"]["create"]>[0]["messages"][number],
  toolCallId: string,
  toolResult: string,
  model?: string
): Promise<AIResponse> {
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const modelToUse = model || process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  const completion = await client.chat.completions.create({
    model: modelToUse,
    messages: [
      ...messages.map((m) => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      })),
      assistantMessage,
      { role: "tool" as const, tool_call_id: toolCallId, content: toolResult },
    ],
    temperature: 0.7,
    max_tokens: 800,
  });

  return {
    content: completion.choices[0].message.content || "",
    provider: "groq",
    tokensUsed: completion.usage?.total_tokens || 0,
  };
}

// ============================================================
// PROVEEDOR: Google Gemini
// ============================================================

async function callGemini(
  messages: AIMessage[],
  tools?: AITool[]
): Promise<AIResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY no configurada");

  const ai = new GoogleGenAI({ apiKey });
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  // Separar el system prompt del resto
  const systemMsg = messages.find((m) => m.role === "system");
  const chatMessages = messages.filter((m) => m.role !== "system");

  // Convertir tools al formato de Gemini
  const geminiTools =
    tools && tools.length > 0
      ? [
          {
            functionDeclarations: tools.map((t) => ({
              name: t.name,
              description: t.description,
              parameters: convertToGeminiSchema(t.parameters),
            })),
          },
        ]
      : undefined;

  // Convertir mensajes al formato Gemini
  const contents = chatMessages.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }],
  }));

  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction: systemMsg?.content,
      temperature: 0.7,
      maxOutputTokens: 800,
      tools: geminiTools,
    },
  });

  const candidate = response.candidates?.[0];
  const parts = candidate?.content?.parts || [];

  // Detectar function calls de Gemini
  const functionCalls = parts.filter((p) => p.functionCall);
  const textParts = parts.filter((p) => p.text).map((p) => p.text).join("");

  const toolCalls: AIToolCall[] = functionCalls.map((p, i) => ({
    id: `gemini_call_${i}`,
    name: p.functionCall!.name || "",
    arguments: (p.functionCall!.args as Record<string, unknown>) || {},
  }));

  return {
    content: textParts,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    provider: "gemini",
    tokensUsed: response.usageMetadata?.totalTokenCount || 0,
  };
}

// Segunda vuelta de Gemini (tras ejecutar tool)
async function callGeminiWithToolResult(
  messages: AIMessage[],
  toolName: string,
  toolResult: string
): Promise<AIResponse> {
  const apiKey = process.env.GEMINI_API_KEY!;
  const ai = new GoogleGenAI({ apiKey });
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const systemMsg = messages.find((m) => m.role === "system");
  const chatMessages = messages.filter((m) => m.role !== "system");

  const contents = [
    ...chatMessages.map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    })),
    {
      role: "user",
      parts: [
        {
          functionResponse: {
            name: toolName,
            response: { result: toolResult },
          },
        },
      ],
    },
  ];

  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction: systemMsg?.content,
      temperature: 0.7,
      maxOutputTokens: 800,
    },
  });

  const text =
    response.candidates?.[0]?.content?.parts
      ?.filter((p) => p.text)
      .map((p) => p.text)
      .join("") || "";

  return {
    content: text,
    provider: "gemini",
    tokensUsed: response.usageMetadata?.totalTokenCount || 0,
  };
}

// ============================================================
// Conversor de schema JSON a schema Gemini
// ============================================================
function convertToGeminiSchema(
  schema: Record<string, unknown>
): Record<string, unknown> {
  if (schema.type === "object" && schema.properties) {
    const props = schema.properties as Record<string, Record<string, unknown>>;
    const converted: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(props)) {
      converted[key] = {
        type: getGeminiType(val.type as string),
        description: val.description,
        ...(val.default !== undefined && { default: val.default }),
      };
    }

    return {
      type: Type.OBJECT,
      properties: converted,
      required: (schema.required as string[]) || [],
    };
  }
  return schema;
}

function getGeminiType(jsonType: string): string {
  const map: Record<string, string> = {
    string: Type.STRING,
    number: Type.NUMBER,
    integer: Type.INTEGER,
    boolean: Type.BOOLEAN,
    array: Type.ARRAY,
    object: Type.OBJECT,
  };
  return map[jsonType] || Type.STRING;
}

// ============================================================
// FUNCIÓN PRINCIPAL: callAI con fallback automático (cadena de 3)
// ============================================================

type AIProvider = "openai" | "gemini" | "groq";

// Cadena de fallback: si el primario falla, prueba en orden
const FALLBACK_CHAINS: Record<AIProvider, AIProvider[]> = {
  groq:   ["gemini", "openai"],
  gemini: ["groq",   "openai"],
  openai: ["groq",   "gemini"],
};

export async function callAI(
  messages: AIMessage[],
  tools?: AITool[]
): Promise<AIResponse> {
  const primaryProvider = (process.env.AI_PROVIDER || "groq") as AIProvider;
  const fallbackChain = FALLBACK_CHAINS[primaryProvider];

  // Intentar con el proveedor principal
  try {
    return await invokeProvider(primaryProvider, messages, tools);
  } catch (primaryError) {
    const errorMsg =
      primaryError instanceof Error ? primaryError.message : String(primaryError);
    console.warn(`[AI] Proveedor principal (${primaryProvider}) falló: ${errorMsg}`);

    // Recorrer la cadena de fallback
    for (const fallback of fallbackChain) {
      console.warn(`[AI] Probando fallback: ${fallback}...`);
      try {
        const result = await invokeProvider(fallback, messages, tools);
        console.info(`[AI] Fallback (${fallback}) exitoso`);
        return result;
      } catch (fallbackError) {
        const fallbackMsg =
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        console.warn(`[AI] Fallback (${fallback}) también falló: ${fallbackMsg}`);
      }
    }

    throw new Error(
      `Todos los proveedores de IA fallaron. Primary: ${errorMsg}`
    );
  }
}

async function invokeProvider(
  provider: AIProvider,
  messages: AIMessage[],
  tools?: AITool[]
): Promise<AIResponse> {
  if (provider === "groq") {
    if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY.startsWith("REEMPLAZAR")) {
      throw new Error("GROQ_API_KEY no configurada");
    }
    return callGroq(messages, tools);
  } else if (provider === "openai") {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.startsWith("REEMPLAZAR")) {
      throw new Error("OPENAI_API_KEY no configurada");
    }
    return callOpenAI(messages, tools);
  } else {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.startsWith("REEMPLAZAR")) {
      throw new Error("GEMINI_API_KEY no configurada");
    }
    return callGemini(messages, tools);
  }
}

// ============================================================
// SEGUNDA VUELTA: tras ejecutar una tool call
// ============================================================

export async function callAIWithToolResult(
  messages: AIMessage[],
  provider: "openai" | "gemini" | "groq",
  toolCallId: string,
  toolName: string,
  toolResult: string,
  originalAssistantMessage?: OpenAI.Chat.ChatCompletionMessage,
  groqModelUsed?: string
): Promise<AIResponse> {
  if (provider === "openai" && originalAssistantMessage) {
    return callOpenAIWithToolResult(
      messages,
      originalAssistantMessage,
      toolCallId,
      toolResult
    );
  }
  if (provider === "groq") {
    const assistantMessage = {
      role: "assistant" as const,
      content: null as string | null,
      tool_calls: [
        { id: toolCallId, type: "function" as const, function: { name: toolName, arguments: "{}" } },
      ],
    };
    return callGroqWithToolResult(messages, assistantMessage, toolCallId, toolResult, groqModelUsed);
  }
  return callGeminiWithToolResult(messages, toolName, toolResult);
}
