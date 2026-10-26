const NAME_KEY = "tabu:name";
const SESSION_KEY = "tabu:session";

export interface StoredSession {
  readonly gameId: string;
  readonly playerId: string;
  readonly playerToken: string;
  readonly code: string;
}

function read(key: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Sin storage (modo privado): la partida sigue, solo no se recuerda.
  }
}

/** S1: el nombre se guarda y se reutiliza. */
export function readPlayerName(): string {
  return read(NAME_KEY) ?? "";
}

export function writePlayerName(name: string): void {
  write(NAME_KEY, name);
}

/** S9: el token permite volver a la partida al recargar o reconectar. */
export function readSession(): StoredSession | null {
  const raw = read(SESSION_KEY);

  if (raw === null) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredSession>;

    if (
      typeof parsed.gameId !== "string" ||
      typeof parsed.playerId !== "string" ||
      typeof parsed.playerToken !== "string" ||
      typeof parsed.code !== "string"
    ) {
      return null;
    }

    return {
      gameId: parsed.gameId,
      playerId: parsed.playerId,
      playerToken: parsed.playerToken,
      code: parsed.code,
    };
  } catch {
    return null;
  }
}

export function writeSession(session: StoredSession): void {
  write(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    // idem
  }
}
