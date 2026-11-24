import { expect, it } from "vitest";
import { creationOrganisation } from "./organisation";
import { messageValidation } from "./messages";

it("nomme le champ fautif, y compris dans le contact principal", () => {
  const sansNom = creationOrganisation.safeParse({ raisonSocialeNom: "", type: "CABINET", responsableId: 1 });
  expect(sansNom.success || messageValidation(sansNom.error)).toBe("Vérifiez le champ « Nom du client ».");
  const contact = creationOrganisation.safeParse({ raisonSocialeNom: "X", type: "CABINET", responsableId: 1, contactPrincipal: { nom: "" } });
  expect(contact.success || messageValidation(contact.error)).toBe("Vérifiez le champ « Nom du contact ».");
});
