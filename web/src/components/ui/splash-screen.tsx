"use client";

import { useEffect, useState } from "react";

export function SplashScreen() {
  const [isVisible, setIsVisible] = useState(true);
  const [shouldRender, setShouldRender] = useState(true);

  useEffect(() => {
    document.body.style.overflow = "hidden";

    const timerFade = setTimeout(() => {
      setIsVisible(false);
    }, 2500);

    const timerRemove = setTimeout(() => {
      setShouldRender(false);
      document.body.style.overflow = "unset";
    }, 3000);

    return () => {
      clearTimeout(timerFade);
      clearTimeout(timerRemove);
      document.body.style.overflow = "unset";
    };
  }, []);

  if (!shouldRender) return null;

  return (
    <div
      className={`
        fixed inset-0 z-[9999] flex flex-col items-center justify-between 
        bg-slate-50 transition-opacity duration-700 ease-in-out
        ${isVisible ? "opacity-100" : "opacity-0 pointer-events-none"}
      `}
    >
      <div className="flex-1" />

      <div className="flex flex-1 flex-col items-center justify-center">
        <h1 className="text-5xl font-black tracking-[0.2em] md:text-7xl text-[#0038A8]">
          SEDUC
        </h1>
      </div>

      <div className="flex flex-1 flex-col items-center justify-end pb-12">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
          from
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://cdn.brandfetch.io/idFonMAIBN/w/220/h/50/theme/light/logo.png?c=1bxid64Mup7aczewSAYMX&t=1693264504552"
          alt="Governo do Pará"
          className="h-12 w-auto"
        />
      </div>
    </div>
  );
}