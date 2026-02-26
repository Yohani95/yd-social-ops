"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Loader2, Users, MessageSquare, Save, Download } from "lucide-react";
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
      <div>
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <Users className="w-5 h-5 sm:w-6 sm:h-6" />
          Contactos
        </h1>
        <p className="text-muted-foreground mt-1">
          CRM basico: clientes detectados por el bot y su historial reciente
        </p>
      </div>
      <div className="flex justify-end">
        <Button variant="outline" onClick={handleExportCsv} disabled={isPending}>
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Exportar CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Lista de contactos</CardTitle>
            <CardDescription>{contacts.length} encontrados</CardDescription>
            <Input
              placeholder="Buscar por nombre, email, telefono..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </CardHeader>
          <CardContent className="space-y-2 max-h-[70vh] overflow-y-auto">
            {filteredContacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay contactos aun.</p>
            ) : (
              filteredContacts.map((contact) => (
                <button
                  key={contact.id}
                  className={`w-full text-left rounded-md border p-3 transition-colors ${
                    selectedContact?.id === contact.id
                      ? "border-primary bg-primary/5"
                      : "hover:border-primary/40"
                  }`}
                  onClick={() => setSelectedContact(contact)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">{contact.name || contact.identifier}</p>
                    <Badge variant="outline" className="text-[10px]">
                      {channelLabels[contact.channel] || contact.channel}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-1">
                    {contact.email || contact.phone || contact.identifier}
                  </p>
                  {(contact.tags || []).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(contact.tags || []).slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[10px]">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Ultima actividad: {contact.last_seen_at ? formatDate(contact.last_seen_at) : "-"}
                  </p>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Conversacion</CardTitle>
            {selectedContact ? (
              <CardDescription>
                {selectedContact.name || selectedContact.identifier} | {channelLabels[selectedContact.channel] || selectedContact.channel}
              </CardDescription>
            ) : (
              <CardDescription>Selecciona un contacto</CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedContact ? (
              <p className="text-sm text-muted-foreground">No hay contacto seleccionado.</p>
            ) : (
              <>
                <div className="rounded-md border p-3 bg-muted/30 max-h-[45vh] overflow-y-auto space-y-2">
                  {conversation === undefined ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : conversation.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No hay mensajes para este contacto.</p>
                  ) : (
                    conversation.map((msg) => (
                      <div key={msg.id} className="space-y-1">
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <MessageSquare className="w-3 h-3" />
                          <span>{formatDate(msg.created_at)}</span>
                          {msg.intent_detected && <Badge variant="secondary" className="text-[10px]">{msg.intent_detected}</Badge>}
                        </div>
                        <p className="text-sm"><strong>Cliente:</strong> {msg.user_message}</p>
                        <p className="text-sm text-muted-foreground"><strong>Bot:</strong> {msg.bot_response}</p>
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Tags</p>
                  <Input
                    value={tagsText}
                    onChange={(e) => setTagsText(e.target.value)}
                    placeholder="interesado, cold, soporte"
                  />
                  <Button onClick={saveTags} disabled={isPending}>
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Guardar tags
                  </Button>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Notas internas</p>
                  <Textarea
                    rows={4}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Agrega observaciones de este contacto..."
                  />
                  <Button onClick={saveNotes} disabled={isPending}>
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Guardar nota
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
