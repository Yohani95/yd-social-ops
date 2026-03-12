import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "YD Social Ops — Plataforma de ventas sociales con IA";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%)",
          fontFamily: "system-ui, sans-serif",
          padding: "60px",
        }}
      >
        {/* Logo + Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "32px" }}>
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "16px",
              background: "#7c3aed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "32px",
            }}
          >
            🤖
          </div>
          <span style={{ color: "white", fontSize: "32px", fontWeight: "700", letterSpacing: "-0.5px" }}>
            YD Social Ops
          </span>
        </div>

        {/* Headline */}
        <h1
          style={{
            color: "white",
            fontSize: "56px",
            fontWeight: "800",
            textAlign: "center",
            lineHeight: 1.1,
            margin: "0 0 20px 0",
            maxWidth: "900px",
          }}
        >
          Plataforma de ventas
          <br />
          <span style={{ color: "#a78bfa" }}>sociales con IA</span>
        </h1>

        {/* Subtitle */}
        <p
          style={{
            color: "rgba(255,255,255,0.75)",
            fontSize: "24px",
            textAlign: "center",
            margin: "0 0 40px 0",
            maxWidth: "700px",
            lineHeight: 1.4,
          }}
        >
          Bot IA · Inbox · CRM · Campañas · Mercado Pago
        </p>

        {/* Badges */}
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", justifyContent: "center" }}>
          {["WhatsApp", "Instagram", "Messenger", "TikTok"].map((ch) => (
            <div
              key={ch}
              style={{
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: "100px",
                padding: "10px 20px",
                color: "white",
                fontSize: "18px",
              }}
            >
              {ch}
            </div>
          ))}
        </div>

        {/* CTA */}
        <div
          style={{
            marginTop: "40px",
            background: "#7c3aed",
            borderRadius: "12px",
            padding: "14px 32px",
            color: "white",
            fontSize: "20px",
            fontWeight: "600",
          }}
        >
          14 días gratis — sin tarjeta de crédito
        </div>
      </div>
    ),
    { ...size }
  );
}
