import { processClaimedJob, redactError } from "../../application/admin/job-processor";
import type {
  AdminClock,
  AdminDeckStore,
  AdminIds,
  AdminJobLimits,
  AdminJobStore,
  AdminLogger,
  GenerationProvider,
  SpellChecker,
} from "../../application/admin/ports";

export interface AdminWorkerDeps {
  readonly jobs: AdminJobStore;
  readonly decks: AdminDeckStore;
  readonly provider: GenerationProvider;
  /** Carga perezosa del validador de ortografía (se cachea). */
  readonly loadSpell: () => Promise<SpellChecker>;
  readonly clock: AdminClock;
  readonly ids: AdminIds;
  readonly log: AdminLogger;
  readonly limits: AdminJobLimits;
  /** Identidad del worker: queda en el lease de los trabajos que reclama. */
  readonly owner: string;
  /** Espera entre reclamos cuando no hay trabajo. */
  readonly pollIntervalMs: number;
}

/**
 * Worker administrativo.
 *
 * Es un loop acotado: reclama de a un trabajo, lo procesa y vuelve a mirar.
 * No hay promesas sueltas: el trabajo vive en la base y sobrevive a un
 * reinicio. `stop()` deja de reclamar, aborta la llamada en vuelo (acotada por
 * el timeout del proveedor) y espera a que el trabajo en curso se asiente.
 */
export class AdminWorker {
  private stopped = false;
  private running: Promise<void> | null = null;
  private readonly controller = new AbortController();

  constructor(private readonly deps: AdminWorkerDeps) {}

  /** Arranca el loop. No hace nada si ya está corriendo. */
  start(): void {
    if (this.running !== null) {
      return;
    }

    this.running = this.loop();
  }

  /** Detiene el loop y espera a que el trabajo en curso termine o se aborte. */
  async stop(): Promise<void> {
    this.stopped = true;
    this.controller.abort();

    await this.running;

    this.running = null;
  }

  private async loop(): Promise<void> {
    while (!this.stopped) {
      try {
        await this.runOnce();
      } catch (error) {
        if (this.stopped) {
          break;
        }

        this.deps.log.error("admin worker iteration failed", { error: redactError(error) });
      }

      // Siempre se espera entre iteraciones: el loop queda acotado y un
      // trabajo que no se puede procesar no genera una ráfaga de reclamos.
      await this.sleep();
    }
  }

  private async runOnce(): Promise<void> {
    const claim = await this.deps.jobs.claimNext({
      owner: this.deps.owner,
      leaseMs: this.deps.limits.leaseMs,
      now: this.deps.clock.now().toISOString(),
    });

    if (claim === null) {
      return;
    }

    const spell = await this.deps.loadSpell();

    await processClaimedJob(
      {
        decks: this.deps.decks,
        jobs: this.deps.jobs,
        provider: this.deps.provider,
        spell,
        clock: this.deps.clock,
        ids: this.deps.ids,
        log: this.deps.log,
      },
      claim,
      this.controller.signal,
    );
  }

  private sleep(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.stopped) {
        resolve();
        return;
      }

      const timer = setTimeout(() => {
        clearTimeout(timer);
        resolve();
      }, this.deps.pollIntervalMs);

      this.controller.signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }
}
