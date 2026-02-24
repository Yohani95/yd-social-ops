"use client";

import { useState } from "react";
import { Copy, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function CopyBotUrlButton({ tenantId }: { tenantId: string }) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/bot/${tenantId}`
      : `/api/bot/${tenantId}`;

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("URL copiada al portapapeles");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex gap-2">
      <Input
        value={`/api/bot/${tenantId}`}
        readOnly
        className="font-mono text-xs bg-background"
      />
      <Button variant="outline" size="icon" onClick={handleCopy}>
        {copied ? (
          <CheckCheck className="w-4 h-4 text-green-500" />
        ) : (
          <Copy className="w-4 h-4" />
        )}
      </Button>
    </div>
  );
}
