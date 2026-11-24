import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { instantSql } from "./datesSql";

describe("instantSql", () => {
  const instant = new Date("2026-10-30T12:00:00.000Z");

  it("convertit explicitement en UTC, sans dépendre du fuseau de la session", () => {
    expect(instantSql(instant).sql).toBe("(?::timestamptz AT TIME ZONE 'UTC')");
    expect(instantSql(instant).values).toEqual([instant]);
  });

  it("s'imbrique dans une requête en gardant un seul paramètre", () => {
    const requete = Prisma.sql`SELECT 1 WHERE "le" < ${instantSql(instant)} AND "id" = ${4}`;
    expect(requete.sql).toBe(`SELECT 1 WHERE "le" < (?::timestamptz AT TIME ZONE 'UTC') AND "id" = ?`);
    expect(requete.values).toEqual([instant, 4]);
  });
});
