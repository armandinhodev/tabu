import type { Metadata } from "next";

import { AppRoot } from "@/ui/app-root";
import { Providers } from "@/ui/providers";
import { readHouseRules } from "@/infrastructure/content/house-rules";

export const metadata: Metadata = {
  title: "Jugar",
  description: "Creá una sala y compartí el código, o entrá con el código que te pasaron.",
};

export default function PlayPage() {
  return (
    <Providers>
      <AppRoot rules={readHouseRules()} />
    </Providers>
  );
}
