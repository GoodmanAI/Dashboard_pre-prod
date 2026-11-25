import { describe, expect, it } from "vitest";
import { adressesDeRepli } from "./mails";

describe("adresses de repli du support", () => {
  it("lit identifiant=adresse et écarte ce qui n'est pas une adresse", () => {
    const m = adressesDeRepli(" admin = enzo@neuracorp.ai , autre=pas-une-adresse, =x@y.fr, sansegal");
    expect([...m]).toEqual([["admin", "enzo@neuracorp.ai"]]);
  });
  it("vide : aucune redirection", () => {
    expect(adressesDeRepli("").size).toBe(0);
  });
});
