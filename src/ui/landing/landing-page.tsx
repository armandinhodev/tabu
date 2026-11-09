import Link from "next/link";
import {
  ArrowRight,
  Clock3,
  Download,
  Layers3,
  LaptopMinimal,
  MessagesSquare,
  Sparkles,
  Trophy,
  UsersRound,
  Zap,
} from "lucide-react";

import { readHouseRules } from "@/infrastructure/content/house-rules";
import { HouseRulesButton } from "@/ui/components/game/house-rules-button";
import { buttonVariants } from "@/ui/components/ui/button-variants";
import { CardShowcaseLoader } from "./card-showcase-loader";
import { LandingMotion } from "./landing-motion";
import { cn } from "@/ui/lib/cn";
import styles from "./landing-page.module.css";

const STEPS = [
  {
    title: "Creá la sala",
    detail: "Elegí el mazo y compartí el código.",
    icon: LaptopMinimal,
  },
  {
    title: "Describí con cuidado",
    detail: "Tu equipo adivina y los rivales vigilan. El reloj es por ronda, no por carta.",
    icon: MessagesSquare,
  },
  {
    title: "Sumá y ganá",
    detail: "Cada acierto suma un punto.",
    icon: Trophy,
  },
] as const;

const FEATURES = [
  { label: "2–4 equipos", icon: UsersRound },
  { label: "30–120 s por ronda", icon: Clock3 },
  { label: "1–6 palabras prohibidas", icon: Layers3 },
] as const;

/**
 * Los CTA salen de la primitiva del sistema: si el botón cambia, la landing
 * cambia con él y no puede quedar vieja por una copia.
 */
const PRIMARY_CTA = buttonVariants({ variant: "primary", size: "lg" });
const SECONDARY_CTA = buttonVariants({ variant: "ghost", size: "lg" });

/**
 * Public landing page. It explains the game and sends people to `/jugar`,
 * which keeps the existing room screen untouched.
 */
export function LandingPage() {
  const rules = readHouseRules();

  return (
    <div className={styles.landing}>
      <main className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-12 px-5 pt-5 pb-10 md:gap-16 md:px-8">
        <header
          className={cn("landing-reveal flex items-center justify-between gap-4", styles.header)}
        >
          <span className={cn("flex items-center gap-2.5", styles.brand)}>
            <span
              aria-hidden="true"
              className="grid size-11 place-items-center rounded-md bg-accent font-display text-h2 font-black text-on-accent"
            >
              T
            </span>
            <span className="font-display text-h1 font-black tracking-tight text-fg uppercase">
              Tabú
            </span>
          </span>
          <nav aria-label="Navegación principal" className="flex items-center gap-3 sm:gap-7">
            <a
              href="#como-se-juega"
              className="hidden text-body-sm font-semibold text-fg transition-colors hover:text-accent sm:inline"
            >
              Cómo se juega
            </a>
            <HouseRulesButton rules={rules} variant="text" />
            <Link
              href="/jugar"
              className={`${buttonVariants({ variant: "ghost", size: "sm" })} ${styles.navPlay}`}
            >
              Jugar
            </Link>
          </nav>
        </header>

        <section aria-label="El juego de palabras para tu grupo" className={styles.hero}>
          <div className="landing-reveal relative z-10 flex min-w-0 flex-col gap-6">
            <p className="flex items-center gap-2 font-display text-caption font-extrabold tracking-wider text-gold uppercase">
              <Sparkles aria-hidden="true" className="size-5 shrink-0" /> El juego de palabras para
              tu grupo
            </p>
            <h1 className="font-display text-hero font-black text-fg">
              Decí todo. <br />
              Menos la <br />
              <span className="text-accent">palabra prohibida.</span>
            </h1>
            <p className="max-w-prose text-body text-fg sm:text-h3">
              Describí, adiviná y ganá con tu equipo.
              <br className="hidden sm:block" /> Cuidado: hay palabras que no podés decir.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="/jugar?accion=crear" className={`${PRIMARY_CTA} ${styles.primaryCta}`}>
                Crear sala <ArrowRight aria-hidden="true" className="size-6" />
              </Link>
              <Link
                href="/jugar?accion=unirse"
                className={`${SECONDARY_CTA} ${styles.secondaryCta}`}
              >
                Unirme con código
              </Link>
            </div>
            <ul
              aria-label="Sin complicaciones"
              className="flex flex-wrap gap-x-5 gap-y-3 text-body-sm font-medium text-fg-muted"
            >
              <li className="flex items-center gap-2">
                <UsersRound aria-hidden="true" className="size-5 text-gold" />
                Sin registro
              </li>
              <li className="flex items-center gap-2">
                <Download aria-hidden="true" className="size-5 text-gold" />
                Sin descargas
              </li>
              <li className="flex items-center gap-2">
                <Zap aria-hidden="true" className="size-5 text-gold" />
                En tiempo real
              </li>
            </ul>
          </div>

          <div
            className={cn("landing-float", styles.scene)}
            aria-hidden="true"
            data-testid="landing-preview"
          >
            <span className={cn(styles.backCard, styles.backCardGold)}>
              <Layers3 />
            </span>
            <span className={cn(styles.backCard, styles.backCardOrange)}>
              <Sparkles />
            </span>
            <div className={styles.frontCard}>
              <CardShowcaseLoader />
            </div>
            <span className={styles.pointBadge}>+1 punto</span>
          </div>
        </section>

        <ul
          aria-label="Opciones de la partida"
          className="landing-reveal grid gap-4 border-y border-line py-5 text-body-sm font-semibold text-fg sm:grid-cols-3 sm:gap-0"
        >
          {FEATURES.map(({ label, icon: Icon }) => (
            <li
              key={label}
              className="flex items-center justify-center gap-3 sm:border-r sm:border-line sm:last:border-r-0"
            >
              <Icon aria-hidden="true" className="size-6 shrink-0 text-gold" />
              {label}
            </li>
          ))}
        </ul>

        <section
          id="como-se-juega"
          tabIndex={-1}
          className="landing-reveal flex scroll-mt-24 flex-col gap-7 outline-none"
        >
          <h2
            tabIndex={-1}
            className="text-center font-display text-display font-black text-fg outline-none"
          >
            Tres pasos. Muchas risas.
          </h2>
          <ol className="grid gap-4 md:grid-cols-3" aria-label="Cómo se juega, paso a paso">
            {STEPS.map(({ title, detail, icon: Icon }, index) => (
              <li
                key={title}
                className={cn(
                  "flex flex-col gap-3 rounded-xl border border-line bg-surface p-6",
                  styles.step,
                )}
              >
                <div aria-hidden="true" className="mb-2 flex items-start justify-between gap-5">
                  <span className="font-display text-display font-black text-accent tabular-nums">
                    0{index + 1}
                  </span>
                  <span className={styles.stepArt}>
                    <Icon strokeWidth={1.5} />
                    {index === 0 && <span>T</span>}
                  </span>
                </div>
                <h3 className="font-display text-h2 font-extrabold text-fg">{title}</h3>
                <p className="text-body-sm text-fg-muted">{detail}</p>
              </li>
            ))}
          </ol>
        </section>

        <section
          className={cn(
            "landing-reveal flex flex-col items-center gap-6 rounded-xl border border-accent/50 px-5 py-10 text-center md:py-12",
            styles.finalCta,
          )}
        >
          <h2 className="font-display text-display font-black text-fg">
            Tu próxima juntada empieza acá.
          </h2>
          <Link href="/jugar?accion=crear" className={`${PRIMARY_CTA} ${styles.primaryCta}`}>
            Crear una sala <ArrowRight aria-hidden="true" className="size-6" />
          </Link>
          <p className="text-body-sm text-fg-muted">
            Jugá por rondas o por puntos. Ranking final por palabras adivinadas.
          </p>
        </section>
      </main>

      <footer>
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-5 pb-8 text-body-sm text-fg-muted sm:flex-row sm:justify-between md:px-8">
          <p>
            <span className="font-display text-h3 font-black text-fg">TABÚ</span>
            <span aria-hidden="true" className="mx-4 text-line-control">
              |
            </span>
            Un juego para compartir.
          </p>
          <span className="flex items-center gap-4">
            <HouseRulesButton rules={rules} variant="text" />
            <Link
              href="/jugar"
              className="font-semibold text-fg underline-offset-4 hover:underline"
            >
              Jugar
            </Link>
          </span>
        </div>
      </footer>

      <LandingMotion />
    </div>
  );
}
