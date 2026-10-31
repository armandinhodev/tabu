import Link from "next/link";

import { CardShowcaseLoader } from "./card-showcase-loader";

const STEPS = [
  {
    title: "Creá la sala",
    detail:
      "Elegís mazo, cantidad de equipos y tiempo por turno. Compartís el código de seis caracteres.",
  },
  {
    title: "Describí sin decir las prohibidas",
    detail: "Quien describe ve la palabra y sus prohibidas; el resto del equipo adivina.",
  },
  {
    title: "Adiviná y sumá",
    detail:
      "Cada acierto suma un punto. Los rivales vigilan las prohibidas y pueden marcar la carta.",
  },
] as const;

const FEATURES = [
  "2 a 4 equipos",
  "30 a 120 segundos por turno",
  "1 a 6 palabras prohibidas por carta",
  "Ranking final por palabras adivinadas",
] as const;

const PRIMARY_CTA =
  "inline-flex min-h-14 items-center justify-center gap-2 rounded-md bg-accent px-6 font-display text-h3 font-semibold text-on-accent transition-[background-color,box-shadow,transform] duration-[var(--dur-instant)] ease-out hover:bg-accent-hover active:scale-[0.98] active:bg-accent-press motion-reduce:transition-none";

const SECONDARY_CTA =
  "inline-flex min-h-14 items-center justify-center gap-2 rounded-md border border-line-control bg-raised px-6 font-display text-h3 font-semibold text-fg shadow-card transition-colors duration-[var(--dur-instant)] hover:bg-raised-hover";

/**
 * Public landing page. It explains the game and sends people to `/jugar`,
 * which keeps the existing room screen untouched.
 */
export function LandingPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-5 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))] md:px-8 md:pt-12">
      <header className="landing-rise flex items-center justify-between gap-4">
        <span className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid size-10 place-items-center rounded-md bg-accent font-display text-h3 font-extrabold text-on-accent"
          >
            T
          </span>
          <span className="font-display text-h2 font-extrabold tracking-[0.08em] text-fg uppercase">
            Tabú
          </span>
        </span>
        <span className="text-caption text-fg-subtle uppercase">Juego de fiesta</span>
      </header>

      <section className="grid items-center gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] md:gap-12">
        <div className="landing-rise landing-rise--2 flex flex-col gap-5">
          <p className="text-caption text-accent uppercase">Juego de palabras para grupos</p>
          <h1 className="font-display text-display font-extrabold break-words text-fg md:text-[3.25rem] md:leading-[1.05]">
            Decí la palabra sin decir las prohibidas.
          </h1>
          <p className="max-w-prose text-body text-fg-muted">
            Tabú se juega en tiempo real con amigos: una persona describe, su equipo adivina y los
            rivales vigilan cada palabra prohibida. Sin registro, sin instalar nada.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/jugar" className={PRIMARY_CTA}>
              Jugar
            </Link>
            <a href="#como-se-juega" className={SECONDARY_CTA}>
              Cómo se juega
            </a>
          </div>
          <p className="text-body-sm text-fg-subtle">
            Solo elegís tu nombre. La partida arranca cuando están todos.
          </p>
        </div>

        <div
          className="landing-float w-full max-w-xs md:mx-auto"
          aria-hidden="true"
          data-testid="landing-preview"
        >
          <CardShowcaseLoader />
        </div>
      </section>

      <section id="como-se-juega" className="landing-rise landing-rise--3 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-h1 font-bold text-fg">Cómo se juega</h2>
          <p className="max-w-prose text-body-sm text-fg-muted">
            Tres pasos, un turno por equipo y un reloj que corre para todos.
          </p>
        </div>
        <ol className="grid gap-4 md:grid-cols-3" aria-label="Cómo se juega, paso a paso">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5"
            >
              <span className="font-mono text-h2 font-bold text-accent tabular-nums">
                {index + 1}
              </span>
              <h3 className="font-display text-h3 font-semibold text-fg">{step.title}</h3>
              <p className="text-body-sm text-fg-muted">{step.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-rise landing-rise--4 flex flex-col gap-4 rounded-xl border border-line bg-surface p-6">
        <h2 className="font-display text-h2 font-bold text-fg">Así se configura la partida</h2>
        <ul
          className="grid max-w-3xl gap-3 sm:grid-cols-2 sm:gap-x-10"
          aria-label="Opciones de la partida"
        >
          {FEATURES.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-body-sm text-fg-muted">
              <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-pill bg-accent" />
              {feature}
            </li>
          ))}
        </ul>
      </section>

      <section className="landing-rise landing-rise--5 flex flex-col items-center gap-4 border-t border-line pt-10 text-center">
        <h2 className="font-display text-h1 font-bold text-fg">¿Jugamos?</h2>
        <p className="max-w-prose text-body-sm text-fg-muted">
          Creá una sala y compartí el código, o entrá con el código que te pasaron. Sin registro:
          solo tu nombre.
        </p>
        <Link href="/jugar" className={PRIMARY_CTA}>
          Jugar
        </Link>
      </section>
    </main>
  );
}
