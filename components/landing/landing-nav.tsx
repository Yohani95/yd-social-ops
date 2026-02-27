"use client";

import Link from "next/link";
import { useState } from "react";
import { Bot, ArrowRight, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

export function LandingNav() {
  const [open, setOpen] = useState(false);

  const navLinks = (
    <>
      <Link href="/pricing" onClick={() => setOpen(false)}>
        <Button variant="ghost" size="sm" className="w-full justify-start sm:w-auto">
          Precios
        </Button>
      </Link>
      <Link href="/login" onClick={() => setOpen(false)}>
        <Button variant="ghost" size="sm" className="w-full justify-start sm:w-auto">
          Iniciar sesión
        </Button>
      </Link>
      <Link href="/register" onClick={() => setOpen(false)}>
        <Button size="sm" className="w-full sm:w-auto">
          Empezar gratis
          <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </Link>
    </>
  );

  return (
    <nav className="border-b sticky top-0 bg-background/80 backdrop-blur-sm z-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 min-w-0">
        <Link href="/" className="flex items-center gap-2 min-w-0 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-base sm:text-lg truncate">YD Social Ops</span>
        </Link>

        {/* Desktop: nav horizontal */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          {navLinks}
        </div>

        {/* Mobile: hamburger + CTA compacto */}
        <div className="flex md:hidden items-center gap-2 shrink-0">
          <Link href="/register">
            <Button size="sm" className="h-9 text-xs px-3">
              Empezar
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => setOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Mobile menu Sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[min(280px,100vw-2rem)]">
          <VisuallyHidden>
            <SheetTitle>Menú de navegación</SheetTitle>
          </VisuallyHidden>
          <div className="flex flex-col gap-4 pt-8">
            <Link href="/pricing" onClick={() => setOpen(false)}>
              <Button variant="ghost" className="w-full justify-start">
                Precios
              </Button>
            </Link>
            <Link href="/login" onClick={() => setOpen(false)}>
              <Button variant="ghost" className="w-full justify-start">
                Iniciar sesión
              </Button>
            </Link>
            <Link href="/register" onClick={() => setOpen(false)}>
              <Button className="w-full">
                Empezar gratis
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
