import type { GameDeps } from "../../application/use-cases/common";
import { expireTurn } from "../../application/use-cases/turn";
import { isTurnExpired } from "../../domain/services/GameStateMachine";
import type { Broadcaster } from "./broadcaster";

const TICK_MS = 1_000;

/**
 * Un intervalo por partida que emite `turn:tick` y cierra por `deadlineAt`
 * (S10, R4). Se detiene al terminar la partida; no acumula ticks ni duplica
 * handlers (R3).
 */
export class TurnTicker {
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(
    private readonly deps: GameDeps,
    private readonly broadcaster: Broadcaster,
  ) {}

  ensure(gameId: string): void {
    if (this.timers.has(gameId)) {
      return;
    }

    const game = this.deps.registry.findById(gameId);

    if (game === null || game.status !== "playing") {
      return;
    }

    const timer = setInterval(() => {
      this.tick(gameId);
    }, TICK_MS);

    timer.unref?.();
    this.timers.set(gameId, timer);
    this.tick(gameId);
  }

  tick(gameId: string): void {
    const game = this.deps.registry.findById(gameId);

    if (game === null || game.status !== "playing" || game.currentTurn === null) {
      this.stop(gameId);
      return;
    }

    const turn = game.currentTurn;

    if (isTurnExpired(turn, this.deps.clock.now())) {
      const result = expireTurn(this.deps, gameId);

      if (result !== null) {
        this.broadcaster.emitEvents(result.game, result.events);
        this.broadcaster.emitState(result.game);

        if (result.game.status !== "playing") {
          this.stop(gameId);
        }
      }

      return;
    }

    const remaining = Math.max(
      0,
      Math.ceil((turn.deadlineAt.getTime() - this.deps.clock.now().getTime()) / 1_000),
    );

    this.broadcaster.emitTick(gameId, remaining);
  }

  stop(gameId: string): void {
    const timer = this.timers.get(gameId);

    if (timer !== undefined) {
      clearInterval(timer);
      this.timers.delete(gameId);
    }
  }

  stopAll(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }

    this.timers.clear();
  }
}
