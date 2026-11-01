"use client";

import { useGame } from "@/ui/providers/game-provider";
import { ReconnectBanner } from "@/ui/components/game/banners";
import { HouseRulesButton } from "@/ui/components/game/house-rules-button";
import { HomeScreen } from "@/ui/screens/home-screen";
import { CreateScreen } from "@/ui/screens/create-screen";
import { JoinScreen } from "@/ui/screens/join-screen";
import { LobbyScreen } from "@/ui/screens/lobby-screen";
import { GameScreen } from "@/ui/screens/game-screen";
import { ResultScreen } from "@/ui/screens/result-screen";
import type { HouseRules } from "@/infrastructure/content/house-rules";

/** Raíz del cliente: una sola pantalla montada, sin perder el socket al navegar. */
export function AppRoot({ rules }: { readonly rules: HouseRules }) {
  const { view, connection } = useGame();

  return (
    <>
      {connection === "reconnecting" || connection === "offline" ? <ReconnectBanner /> : null}

      {view === "home" ? <HomeScreen /> : null}
      {view === "create" ? <CreateScreen /> : null}
      {view === "join" ? <JoinScreen /> : null}
      {view === "lobby" ? <LobbyScreen /> : null}
      {view === "game" ? <GameScreen rules={rules} /> : null}
      {view === "result" ? <ResultScreen /> : null}

      {/* En la partida el acceso vive en la cabecera y en el panel lateral. */}
      {view === "game" ? null : <HouseRulesButton rules={rules} variant="fab" />}
    </>
  );
}
