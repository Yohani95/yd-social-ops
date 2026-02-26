export default function JsonLd() {
    const data = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "YD Social Ops",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description:
            "Bot de ventas con IA para redes sociales. Automatiza WhatsApp, Instagram, Messenger y tu sitio web. Genera links de pago de Mercado Pago automáticamente.",
        url: process.env.NEXT_PUBLIC_APP_URL || "https://ydsocialops.com",
        offers: [
            {
                "@type": "Offer",
                name: "Plan Básico",
                price: "9990",
                priceCurrency: "CLP",
                priceValidUntil: "2027-12-31",
                availability: "https://schema.org/InStock",
            },
            {
                "@type": "Offer",
                name: "Plan Pro",
                price: "24990",
                priceCurrency: "CLP",
                priceValidUntil: "2027-12-31",
                availability: "https://schema.org/InStock",
            },
            {
                "@type": "Offer",
                name: "Plan Business",
                price: "49990",
                priceCurrency: "CLP",
                priceValidUntil: "2027-12-31",
                availability: "https://schema.org/InStock",
            },
            {
                "@type": "Offer",
                name: "Plan Enterprise",
                price: "79990",
                priceCurrency: "CLP",
                priceValidUntil: "2027-12-31",
                availability: "https://schema.org/InStock",
            },
        ],
        featureList: [
            "Bot de ventas con IA",
            "WhatsApp Business API",
            "Instagram Messaging",
            "Facebook Messenger",
            "TikTok Business",
            "Links de pago Mercado Pago",
            "CRM integrado",
            "Analíticas de conversiones",
            "Gestión de inventario automática",
        ],
        inLanguage: "es",
        aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: "4.8",
            ratingCount: "150",
            bestRating: "5",
        },
    };

    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
        />
    );
}
