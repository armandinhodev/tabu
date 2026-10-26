import type { GameStateView, TurnView } from "@/application/dto/game-state";
import type { ViolationReason } from "@/domain/entities/Violation";

/**
 * Contrato compartido por las vistas de rol de la partida. La composición
 * (`game-screen.tsx`) decide cuál se monta según `state.me.role`; las vistas no
 * hablan con el socket, solo llaman callbacks.
 */
export interface RoleViewProps {
  readonly state: GameStateView;
  readonly turn: TurnView;
  readonly busy: boolean;
  /** Palabra ya reportada en este turno, para pintar el chip en rojo sólido. */
  readonly reportedWord: string | null;
  readonly onGuess: () => void;
  readonly onPass: () => void;
  readonly onSkipCard: () => void;
  readonly onReport: (reason: ViolationReason, tabooWord?: string) => void;
}
