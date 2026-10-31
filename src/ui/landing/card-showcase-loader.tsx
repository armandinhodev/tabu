"use client";

import dynamic from "next/dynamic";

/**
 * Motion is a client-only library. Loading it without server rendering keeps
 * the landing prerenderable and ships the animation bundle after hydration.
 */
const CardShowcase = dynamic(
  () => import("./card-showcase").then((module) => module.CardShowcase),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[19rem] flex-col gap-4 rounded-xl border border-line-strong bg-surface-2 p-5 shadow-float" />
    ),
  },
);

export function CardShowcaseLoader() {
  return <CardShowcase />;
}
