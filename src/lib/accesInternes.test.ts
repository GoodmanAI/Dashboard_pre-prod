import { describe, expect, it } from "vitest";
import {
  PAGES_ADMIN, PREREGLAGES, accesDepuisTexte, apiPermiseAInterne, lireTranscriptionsPermis, cleAdminDuChemin, lireAccesInternes,
  normaliserAccesInternes, ouvreLeDashboard, ouvreLesCentres, premierEcranAdmin,
} from "./accesInternes";
import { hasPermission, PAGES } from "./permissions";
import { peutOuvrirAdmin, verdictAcces } from "./pageAccess";

const admin = (permissions: unknown) => ({ role: "ADMIN", permissions });

describe("comptes internes : refus par défaut", () => {
  it("un ADMIN sans rien de coché n'ouvre aucun écran du Dashboard", () => {
    for (const permissions of [null, undefined, {}, "n'importe quoi", []]) {
      expect(hasPermission(admin(permissions), PAGES.CALLS, "read")).toBe(false);
      expect(peutOuvrirAdmin(admin(permissions), PAGES_ADMIN.VUE_ENSEMBLE)).toBe(false);
      expect(ouvreLeDashboard(lireAccesInternes(permissions))).toBe(false);
    }
  });

  it("le super-administrateur ouvre tout, même un écran sans clé", () => {
    const sa = { role: "SUPER_ADMIN", permissions: {} };
    expect(hasPermission(sa, PAGES.PARAMETRAGE, "write")).toBe(true);
    expect(peutOuvrirAdmin(sa, null)).toBe(true);
  });

  it("une page cochée en lecture s'ouvre, sans l'écriture", () => {
    const u = admin({ calls: "read" });
    expect(hasPermission(u, PAGES.CALLS, "read")).toBe(true);
    expect(hasPermission(u, PAGES.CALLS, "write")).toBe(false);
    expect(hasPermission(u, PAGES.INCIDENTS, "read")).toBe(false);
  });

  it("un écran d'administration sans clé reste au super-administrateur", () => {
    expect(cleAdminDuChemin("/admin/settings")).toBeNull();
    expect(peutOuvrirAdmin(admin({ admin_vue_ensemble: "read" }), cleAdminDuChemin("/admin/settings"))).toBe(false);
  });

  it("un client n'ouvre jamais l'administration, même avec la clé en base", () => {
    expect(peutOuvrirAdmin({ role: "CLIENT", permissions: { admin_vue_ensemble: "read" } }, PAGES_ADMIN.VUE_ENSEMBLE)).toBe(false);
  });
});

describe("lecture et écriture du JSON", () => {
  it("écarte les clés inconnues et ramène « write » à « read » hors des pages du quotidien", () => {
    const lu = lireAccesInternes({ calls: "write", parametrage: "write", admin_comptes: "write", inconnue: "read", incidents: "none" });
    expect(lu).toEqual({ calls: "write", parametrage: "read", admin_comptes: "read" });
  });

  it("normalise dans l'ordre de l'écran, pour comparer deux versions", () => {
    expect(JSON.stringify(normaliserAccesInternes({ calls: "read", admin_comptes: "read" })))
      .toBe(JSON.stringify(normaliserAccesInternes({ admin_comptes: "read", calls: "read" })));
  });

  it("le préréglage « Pilot seul » n'ouvre rien, « Tout en lecture » n'écrit rien", () => {
    expect(ouvreLeDashboard(PREREGLAGES.find((p) => p.cle === "pilot")!.acces())).toBe(false);
    const tout = PREREGLAGES.find((p) => p.cle === "tout")!.acces();
    expect(Object.values(tout).every((n) => n === "read")).toBe(true);
  });
});

describe("colonne « dashboard » du fichier de l'équipe", () => {
  it("additionne un préréglage et des écrans, en lecture", () => {
    const lu = accesDepuisTexte("centres + admin_vue_ensemble");
    expect(typeof lu).toBe("object");
    const acces = lu as Exclude<typeof lu, string>;
    expect(acces.admin_vue_ensemble).toBe("read");
    expect(acces.calls).toBe("read");
    expect(Object.values(acces).every((n) => n === "read")).toBe(true);
    expect(peutOuvrirAdmin(admin(acces), PAGES_ADMIN.COMPTES)).toBe(false);
    expect(ouvreLesCentres(acces)).toBe(true);
  });

  it("vide : Pilot seul ; un écran inconnu est refusé", () => {
    expect(accesDepuisTexte("")).toEqual({});
    expect(accesDepuisTexte("pilot")).toEqual({});
    expect(accesDepuisTexte("centres+admin_tout")).toBe("écran inconnu : « admin_tout »");
  });
});

describe("adresses", () => {
  it("rattache chaque écran d'administration à sa clé", () => {
    expect(verdictAcces("/admin/overview")).toEqual({ genre: "admin", cle: "admin_vue_ensemble" });
    expect(verdictAcces("/admin/nouveau-centre-konnect")).toEqual({ genre: "admin", cle: "admin_mise_en_service" });
    expect(verdictAcces("/admin/profile")).toEqual({ genre: "exempt" });
    expect(verdictAcces("/admin/ticket")).toEqual({ genre: "page", page: "tickets" });
  });

  it("premier écran : l'administration d'abord, sinon rien (le choix du centre décide)", () => {
    expect(premierEcranAdmin({ admin_actions: "read", admin_comptes: "read" })).toBe("/admin/actions");
    expect(premierEcranAdmin({ calls: "read" })).toBeNull();
    expect(ouvreLesCentres({ calls: "read" })).toBe(true);
    expect(ouvreLesCentres({ tickets: "read", admin_comptes: "read" })).toBe(false);
  });
});

describe("routes d'API", () => {
  it("une route absente de la carte est refusée", () => {
    expect(apiPermiseAInterne("/api/route-qui-n-existe-pas", { calls: "read" })).toBe(false);
  });

  it("Pilot seul : la cloche, la connexion et ce que lit Pilot, rien d'autre", () => {
    for (const ok of ["/api/notification/get-unread", "/api/auth/session", "/api/centre-statut", "/api/completude", "/api/deployments", "/api/socket"]) {
      expect(apiPermiseAInterne(ok, {}), ok).toBe(true);
    }
    for (const non of ["/api/calls", "/api/admin/centres", "/api/prescriptions/alerts", "/api/tickets", "/api/admin/clients"]) {
      expect(apiPermiseAInterne(non, {}), non).toBe(false);
    }
  });

  it("un écran ouvre ses routes et le commun, pas celles des autres écrans", () => {
    const appels = { calls: "read" } as const;
    expect(apiPermiseAInterne("/api/calls", appels)).toBe(true);
    expect(apiPermiseAInterne("/api/calls/12/flag", appels)).toBe(true);
    expect(apiPermiseAInterne("/api/admin/centres", appels)).toBe(true);
    expect(apiPermiseAInterne("/api/prescriptions/alerts", appels)).toBe(false);
    expect(apiPermiseAInterne("/api/admin/clients", appels)).toBe(false);
  });

  it("les routes des machines et du super-administrateur restent fermées, quoi qu'on coche", () => {
    const tout = PREREGLAGES.find((p) => p.cle === "tout")!.acces();
    for (const non of ["/api/rdv/init", "/api/calls/summary", "/api/admin/users", "/api/admin/users/3/kick", "/api/prescriptions/pending"]) {
      expect(apiPermiseAInterne(non, tout), non).toBe(false);
    }
  });
});

describe("transcriptions des appels (RGPD, 24/11/2026)", () => {
  it("seuls Appels et Incidents ouvrent les conversations", () => {
    const equipe = accesDepuisTexte("centres+admin_vue_ensemble-calls-incidents") as Record<string, string>;
    expect(equipe.calls).toBeUndefined();
    expect(equipe.incidents).toBeUndefined();
    expect(equipe.admin_vue_ensemble).toBe("read");
    expect(equipe.stats_appel).toBe("read");
    expect(lireTranscriptionsPermis({ permissions: equipe })).toBe(false);
    expect(lireTranscriptionsPermis({ permissions: { stats_appel: "read", dashboard: "read" } })).toBe(false);
    expect(lireTranscriptionsPermis({ permissions: { calls: "read" } })).toBe(true);
    expect(lireTranscriptionsPermis({ permissions: { incidents: "read" } })).toBe(true);
  });
});
