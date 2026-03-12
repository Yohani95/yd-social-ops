"use client";

import { useEffect } from "react";
import Script from "next/script";

const COOKIE_CONSENT_KEY = "yd_cookie_consent";

interface MetaPixelProps {
  pixelId: string;
}

export function MetaPixel({ pixelId }: MetaPixelProps) {
  useEffect(() => {
    // Only init if consent was previously given
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (consent !== "accepted") return;

    if (typeof window !== "undefined" && window.fbq) {
      window.fbq("init", pixelId);
      window.fbq("track", "PageView");
    }
  }, [pixelId]);

  // Only inject the script itself — init is deferred to useEffect after consent check
  return (
    <Script id="meta-pixel-loader" strategy="afterInteractive">{`
      !function(f,b,e,v,n,t,s)
      {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)}(window, document,'script',
      'https://connect.facebook.net/en_US/fbevents.js');
    `}</Script>
  );
}

// Extend window type for fbq
declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}
