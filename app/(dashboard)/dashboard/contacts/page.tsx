"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Loader2, Users, MessageSquare, Save, Download, User, Calendar, Tag, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { getContacts, getContactConversation, updateContactNotes, updateContactTags, exportContactsCsv } from "@/actions/contacts";
import type { ChatLog, Contact } from "@/types";

const channelLabels: Record<string, string> = {
  web: "Web",
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram",
  tiktok: "TikTok",
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[] | undefined>(undefined);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [conversation, setConversation] = useState<ChatLog[] | undefined>(undefined);
  const [notes, setNotes] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    getContacts().then((items) => {
      setContacts(items || []);
      if (items?.length) {
        setSelectedContact(items[0]);
        setNotes(items[0].notes || "");
        setTagsText((items[0].tags || []).join(", "));
      }
    }).catch(() => setContacts([]));
  }, []);

  useEffect(() => {
    if (!selectedContact) {
      setConversation([]);
      return;
    }

    setNotes(selectedContact.notes || "");
    setTagsText((selectedContact.tags || []).join(", "));
    setConversation(undefined);
    getContactConversation({
      channel: selectedContact.channel,
      identifier: selectedContact.identifier,
      limit: 100,
    }).then((rows) => setConversation(rows || [])).catch(() => setConversation([]));
  }, [selectedContact]);

  const filteredContacts = useMemo(() => {
    if (!contacts) return [];
    const q = search.trim().toLowerCase();
    if (!q) return contacts;

    return contacts.filter((c) =>
      [c.name, c.email, c.phone, c.identifier]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [contacts, search]);

  function saveNotes() {
    if (!selectedContact) return;

    startTransition(async () => {
      const result = await updateContactNotes(selectedContact.id, notes);
      if (!result.success) {
        toast.error(result.error || "No se pudo guardar la nota");
        return;
      }

      setContacts((prev) =>
        (prev || []).map((c) => (c.id === selectedContact.id ? { ...c, notes } : c))
      );
      toast.success("Nota guardada");
    });
  }

  function saveTags() {
    if (!selectedContact) return;

    startTransition(async () => {
      const result = await updateContactTags(selectedContact.id, tagsText);
      if (!result.success) {
        toast.error(result.error || "No se pudieron guardar los tags");
        return;
      }

      const normalized = tagsText
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean);

      setContacts((prev) =>
        (prev || []).map((c) => (c.id === selectedContact.id ? { ...c, tags: normalized } : c))
      );
      toast.success("Tags guardados");
    });
  }

  function downloadCsv(filename: string, content: string) {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleExportCsv() {
    startTransition(async () => {
      const result = await exportContactsCsv();
      if (!result.success || !result.data) {
        toast.error(result.error || "No se pudo exportar CSV");
        return;
      }
      downloadCsv(`contacts-${new Date().toISOString().slice(0, 10)}.csv`, result.data.csv);
      toast.success(`CSV exportado (${result.data.count} contactos)`);
    });
  }

  if (contacts === undefined) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Users className="w-5 h-5 sm:w-6 sm:h-6" />
            Contactos
          </h1>
          <p className="text-muted-foreground mt-1">
            Gestión de clientes y prospectos detectados por tu asistente IA
          </p>
        </div>
        <Button variant="outline" onClick={handleExportCsv} disabled={isPending} className="sm:w-auto">
          {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
          Exportar CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista de Contactos */}
        <Card className="lg:col-span-1 shadow-sm border-muted-foreground/10 overflow-hidden">
          <CardHeader className="pb-4 bg-muted/30 border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Base de Clientes</CardTitle>
              <Badge variant="secondary" className="font-mono">{contacts.length}</Badge>
            </div>
            <div className="mt-4">
              <Input
                placeholder="Buscar por nombre, email, teléfono..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-background"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-y-auto min-h-[200px] max-h-[calc(100vh-280px)] sm:max-h-[calc(100vh-320px)]">
            {filteredContacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                  <Users className="w-6 h-6 text-muted-foreground/40" />
                </div>
                <p className="text-sm text-muted-foreground">No se encontraron contactos.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredContacts.map((contact) => (
                  <button
                    key={contact.id}
                    className={`w-full text-left p-4 transition-all duration-200 border-l-4 ${selectedContact?.id === contact.id
                      ? "border-primary bg-primary/5 active shadow-inner"
                      : "border-transparent hover:bg-muted/50"
                      }`}
                    onClick={() => setSelectedContact(contact)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold truncate text-foreground group-hover:text-primary transition-colors">
                          {contact.name || contact.identifier}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate font-mono mt-0.5">
                          {contact.email || contact.phone || contact.identifier}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-tight bg-background">
                          {channelLabels[contact.channel] || contact.channel}
                        </Badge>
                        {contact.canonical_contact_id && (
                          <span className="text-[9px] text-muted-foreground" title="Vinculado a otro contacto">
                            ↭
                          </span>
                        )}
                      </div>
                    </div>

                    {(contact.tags || []).length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {(contact.tags || []).slice(0, 3).map((tag) => (
                          <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-md bg-secondary text-secondary-foreground font-semibold">
                            #{tag.toUpperCase()}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground/70">
                      <span className="flex items-center gap-1" suppressHydrationWarning>
                        <Calendar className="w-3 h-3" />
                        {contact.last_seen_at ? formatDate(contact.last_seen_at) : "Sin actividad"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Detalle y Conversación */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm border-muted-foreground/10 h-full flex flex-col min-h-[500px]">
            <CardHeader className="pb-4 border-b bg-muted/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="w-5 h-5 text-primary" />
                </div>
                {selectedContact ? (
                  <div className="min-w-0">
                    <CardTitle className="text-lg font-bold truncate">
                      {selectedContact.name || selectedContact.identifier}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-2">
                      <span className="font-mono text-xs">{selectedContact.identifier}</span>
                      <span className="text-muted-foreground/20">|</span>
                      <span className="capitalize">{channelLabels[selectedContact.channel] || selectedContact.channel}</span>
                    </CardDescription>
                  </div>
                ) : (
                  <div>
                    <CardTitle className="text-lg">Detalle de Contacto</CardTitle>
                    <CardDescription>Selecciona un contacto de la lista</CardDescription>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
              {!selectedContact ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
                  <Info className="w-10 h-10 mb-2 opacity-20" />
                  <p>Haz clic en un contacto para ver su historial e información.</p>
                </div>
              ) : (
                <div className="flex-1 flex flex-col min-h-[300px] max-h-[calc(100vh-280px)] sm:max-h-[calc(100vh-260px)]">
                  {/* Chat / Historial */}
                  <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 bg-muted/5">
                    {conversation === undefined ? (
                      <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                      </div>
                    ) : conversation.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground opacity-50">
                        <MessageSquare className="w-8 h-8 mb-2" />
                        <p className="text-sm italic">Sin historial de mensajes.</p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {conversation.map((msg) => (
                          <div key={msg.id} className="space-y-2">
                            <div className="flex items-center justify-center">
                              <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground font-medium border border-border/50" suppressHydrationWarning>
                                {formatDate(msg.created_at)}
                              </span>
                            </div>

                            {/* Mensaje Usuario */}
                            <div className="flex flex-col items-end group">
                              <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-none px-4 py-2.5 text-sm shadow-sm max-w-[85%] leading-relaxed">
                                {msg.user_message}
                              </div>
                              {msg.intent_detected && (
                                <div className="mt-1.5">
                                  <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-200/50 text-[9px] px-2 py-0 font-bold uppercase tracking-wider shadow-sm">
                                    Intención: {msg.intent_detected}
                                  </Badge>
                                </div>
                              )}
                            </div>

                            {/* Respuesta Bot */}
                            <div className="flex flex-col items-start group">
                              <div className="bg-background border rounded-2xl rounded-tl-none px-4 py-2.5 text-sm shadow-sm max-w-[85%] leading-relaxed border-muted-foreground/10">
                                {msg.bot_response}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Sidebar de Edición (Notas y Tags) en el mismo panel */}
                  <div className="border-t p-4 bg-background grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 mb-1">
                        <Tag className="w-3.5 h-3.5 text-primary" />
                        <span className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Etiquetas</span>
                      </div>
                      <div className="flex gap-2">
                        <Input
                          value={tagsText}
                          onChange={(e) => setTagsText(e.target.value)}
                          placeholder="interesado, cliente, vip..."
                          className="text-sm h-9"
                        />
                        <Button size="sm" onClick={saveTags} disabled={isPending} className="h-9">
                          {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                      <p className="text-[10px] text-muted-foreground font-medium">Separados por comas</p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2 mb-1">
                        <Save className="w-3.5 h-3.5 text-primary" />
                        <span className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Notas Internas</span>
                      </div>
                      <div className="flex gap-2">
                        <Textarea
                          rows={1}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Observaciones importantes..."
                          className="text-sm min-h-[36px] resize-none py-2"
                        />
                        <Button size="sm" onClick={saveNotes} disabled={isPending} className="h-9">
                          {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                      <p className="text-[10px] text-muted-foreground font-medium">Solo visible para tu equipo</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
