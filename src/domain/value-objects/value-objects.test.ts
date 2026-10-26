import { describe, expect, it } from "vitest";

import {
  InvalidDurationError,
  InvalidIdentifierError,
  InvalidRoomCodeError,
  InvalidScoreError,
  InvalidTabooWordsError,
} from "../errors/DomainError";
import { Duration } from "./Duration";
import { CardId, GameId, PlayerId, TeamId, TurnId } from "./PlayerId";
import { RoomCode } from "./RoomCode";
import { Score } from "./Score";
import { TabooWords, normalizeWord } from "./TabooWords";

describe("RoomCode", () => {
  it("normaliza a mayúsculas y acepta solo el alfabeto permitido", () => {
    expect(RoomCode.create("qk7m2p").value).toBe("QK7M2P");
  });

  it.each(["ABCDE", "ABCDEFG", "ABCDE0", "ABCDE1", "ABCDEI", "ABCDEO", "  "])(
    "rechaza el código inválido %s",
    (raw) => {
      expect(() => RoomCode.create(raw)).toThrow(InvalidRoomCodeError);
    },
  );

  it("genera códigos de 6 caracteres del alfabeto sin ambigüedades", () => {
    expect(RoomCode.generate(() => 0).value).toBe("AAAAAA");
    expect(RoomCode.generate(() => 0.999999).value).toBe("999999");

    const code = RoomCode.generate(() => 0.5);
    expect(code.value).toHaveLength(6);
    for (const char of code.value) {
      expect(RoomCode.ALPHABET).toContain(char);
    }
  });

  it("compara por valor", () => {
    expect(RoomCode.create("ABC234").equals(RoomCode.create("abc234"))).toBe(true);
    expect(RoomCode.create("ABC234").equals(RoomCode.create("ABC235"))).toBe(false);
  });
});

describe("Score", () => {
  it("suma y resta sin bajar de cero", () => {
    expect(Score.from(3).plus().value).toBe(4);
    expect(Score.from(3).plus(2).value).toBe(5);
    expect(Score.from(3).minus().value).toBe(2);
    expect(Score.from(0).minus().value).toBe(0);
  });

  it("rechaza valores no enteros o negativos", () => {
    expect(() => Score.from(-1)).toThrow(InvalidScoreError);
    expect(() => Score.from(1.5)).toThrow(InvalidScoreError);
    expect(() => Score.from(Number.NaN)).toThrow(InvalidScoreError);
  });

  it("compara y compara igualdad", () => {
    expect(Score.from(2).compare(Score.from(3))).toBe(-1);
    expect(Score.from(3).compare(Score.from(3))).toBe(0);
    expect(Score.from(4).compare(Score.from(3))).toBe(1);
    expect(Score.from(4).equals(Score.from(4))).toBe(true);
  });
});

describe("Duration", () => {
  it("exige segundos enteros positivos", () => {
    expect(Duration.fromSeconds(45).seconds).toBe(45);
    expect(() => Duration.fromSeconds(0)).toThrow(InvalidDurationError);
    expect(() => Duration.fromSeconds(-5)).toThrow(InvalidDurationError);
    expect(() => Duration.fromSeconds(1.5)).toThrow(InvalidDurationError);
  });

  it("expone milisegundos y compara", () => {
    expect(Duration.fromSeconds(2).toMilliseconds()).toBe(2000);
    expect(Duration.fromSeconds(2).equals(Duration.fromSeconds(2))).toBe(true);
  });
});

describe("TabooWords", () => {
  it("normaliza mayúsculas, acentos y espacios", () => {
    expect(normalizeWord("  Fuegó   Negro ")).toBe("fuego negro");
    expect(normalizeWord("ÁRBOL")).toBe("arbol");
  });

  it("exige entre 1 y 4 palabras normalizadas sin duplicados", () => {
    expect(TabooWords.create(["Fuego", "Calor"]).words).toEqual(["fuego", "calor"]);
    expect(() => TabooWords.create([])).toThrow(InvalidTabooWordsError);
    expect(() => TabooWords.create(["a", "b", "c", "d", "e"])).toThrow(InvalidTabooWordsError);
    expect(() => TabooWords.create(["Fuego", "  fuego "])).toThrow(InvalidTabooWordsError);
    expect(() => TabooWords.create(["   "])).toThrow(InvalidTabooWordsError);
  });

  it("encuentra palabras comparando normalizado", () => {
    const words = TabooWords.create(["Fuego", "Calor"]);
    expect(words.contains("FUEGO")).toBe(true);
    expect(words.contains("calór")).toBe(true);
    expect(words.contains("agua")).toBe(false);
  });

  it("compara por valor", () => {
    expect(TabooWords.create(["fuego"]).equals(TabooWords.create(["FUEGO"]))).toBe(true);
  });
});

describe("ids", () => {
  it("recorta y valida identificadores no vacíos", () => {
    expect(GameId.from(" g1 ")).toBe("g1");
    expect(TeamId.from("t1")).toBe("t1");
    expect(PlayerId.from("p1")).toBe("p1");
    expect(CardId.from("c1")).toBe("c1");
    expect(TurnId.from("turn1")).toBe("turn1");

    expect(() => PlayerId.from("  ")).toThrow(InvalidIdentifierError);
    try {
      PlayerId.from("  ");
    } catch (error) {
      expect((error as InvalidIdentifierError).code).toBe("INVALID_IDENTIFIER");
    }
  });
});
