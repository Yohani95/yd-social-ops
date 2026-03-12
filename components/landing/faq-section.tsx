const faqs = [
  {
    q: "¿Cómo funciona el período de prueba?",
    a: "Tienes 14 días gratis al crear tu cuenta. No necesitas tarjeta de crédito. Al terminar el período, puedes suscribirte al plan que prefieras.",
  },
  {
    q: "¿El dinero de las ventas llega directo a mi cuenta?",
    a: "Sí. Los pagos de tus clientes llegan directo a tu cuenta de Mercado Pago. Nosotros no intermediamos los fondos.",
  },
  {
    q: "¿Puedo cambiar de plan cuando quiera?",
    a: "Por supuesto. Puedes hacer upgrade o downgrade en cualquier momento desde tu panel de configuración.",
  },
  {
    q: "¿Cómo integro el bot a WhatsApp?",
    a: "El Plan Business incluye integración con WhatsApp Business API. Te entregamos la URL del webhook para configurar en pocos minutos.",
  },
  {
    q: "¿Necesito saber programar?",
    a: "No. Todo funciona desde tu navegador con interfaz visual. Conectas tus canales, cargas tu catálogo y el bot empieza a responder. Sin código.",
  },
  {
    q: "¿Qué pasa con los mensajes fuera de horario?",
    a: "El bot responde 24/7, incluso de madrugada o en feriados. Puedes configurar un mensaje de bienvenida y el tono de respuesta para que suene como tú.",
  },
  {
    q: "¿Sirve para negocios de servicios (sin productos físicos)?",
    a: "Sí. El bot puede informar sobre tus servicios, capturar datos del cliente, coordinar pagos por adelantado y derivar a tu equipo cuando sea necesario.",
  },
  {
    q: "¿Mis datos de Mercado Pago están seguros?",
    a: "Tus tokens de Mercado Pago se almacenan cifrados con AES-256. Nunca los exponemos ni los enviamos a terceros. Los pagos fluyen directamente a tu cuenta.",
  },
];

interface FAQSectionProps {
  title?: string;
  subtitle?: string;
}

export function FAQSection({
  title = "Preguntas frecuentes",
  subtitle,
}: FAQSectionProps) {
  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16 border-t">
      <h2 className="text-2xl font-bold text-center mb-3">{title}</h2>
      {subtitle && (
        <p className="text-center text-muted-foreground mb-8">{subtitle}</p>
      )}
      {!subtitle && <div className="mb-8" />}
      <div className="space-y-4">
        {faqs.map((faq) => (
          <details key={faq.q} className="group border rounded-lg">
            <summary className="flex items-center justify-between cursor-pointer p-5 font-medium list-none select-none">
              <span>{faq.q}</span>
              <span className="ml-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <div className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">
              {faq.a}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
