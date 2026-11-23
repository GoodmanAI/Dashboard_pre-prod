/** Une erreur attendue du métier garde le même statut dans toutes les routes. 429, 502, 503 : un service externe (annuaire, C-89) limite, échoue ou est coupé. */
export class ErreurMetier extends Error {
  constructor(message: string, public readonly statut: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 502 | 503) {
    super(message);
    this.name = "ErreurMetier";
  }
}
