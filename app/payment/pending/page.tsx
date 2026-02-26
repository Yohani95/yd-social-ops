import Link from "next/link";
import { Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Pago pendiente" };

export default function PaymentPendingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-6">
          <Clock3 className="w-10 h-10 text-amber-600" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Pago pendiente</h1>
        <p className="text-muted-foreground mb-6">
          Tu pago esta siendo procesado. Te avisaremos cuando quede aprobado.
        </p>
        <Link href="/">
          <Button>Volver al inicio</Button>
        </Link>
      </div>
    </div>
  );
}
