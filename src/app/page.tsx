/**
 * Fase 0 — página de verificación del sistema de diseño.
 * Las pantallas reales llegan en la fase 4; esto prueba tokens, tipografía,
 * superficies, chips de palabras prohibidas y el acento de acción.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-3">
        <span className="text-caption text-fg-subtle uppercase">Tabú · fase 0</span>
        <h1 className="font-display text-h1 font-bold">Sistema de diseño</h1>
        <p className="text-body-sm text-fg-muted">
          Tokens, tipografía y tooling verificados. Todavía no hay juego: eso empieza en la fase 1.
        </p>
      </header>

      <section className="rounded-lg border border-line bg-surface-2 p-6">
        <span className="text-caption text-warning uppercase">No digas estas palabras</span>
        <p className="mt-4 font-display text-word font-extrabold uppercase">Fuego</p>
        <ul className="mt-6 flex flex-wrap gap-2">
          <li className="rounded-pill border border-danger bg-danger-soft px-4 py-2 text-body-sm text-fg">
            llama
          </li>
          <li className="rounded-pill border border-danger bg-danger-soft px-4 py-2 text-body-sm text-fg">
            calor
          </li>
          <li className="rounded-pill border border-danger bg-danger-soft px-4 py-2 text-body-sm text-fg">
            humo
          </li>
        </ul>
      </section>

      <section className="flex items-center justify-between rounded-lg border border-line bg-surface p-4">
        <div className="flex flex-col">
          <span className="text-caption text-fg-subtle uppercase">Sala</span>
          <span className="font-mono text-code font-bold text-fg uppercase">QK7M2P</span>
        </div>
        <span className="font-mono text-display font-bold text-gold">45</span>
      </section>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          className="min-h-13 w-full rounded-md bg-accent px-4 font-display font-semibold text-on-accent transition-colors duration-[var(--dur-instant)] hover:bg-accent-hover active:bg-accent-press"
        >
          Comenzar partida
        </button>
        <button
          type="button"
          className="min-h-13 w-full rounded-md border border-line px-4 font-semibold text-fg transition-colors duration-[var(--dur-instant)] hover:bg-surface-2"
        >
          Pasar turno
        </button>
      </div>
    </main>
  );
}
