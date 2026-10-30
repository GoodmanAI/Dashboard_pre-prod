import type { CleExamen, ReponsesTalk } from "@/lib/questionnaireTalk";

/**
 * La fiche d'ouverture d'un nouveau client, relue par l'assistant « Nouveau centre »
 * (plan `2026-10-onboarding-admin-depuis-la-fiche.md`).
 *
 * La fiche est un HTML autonome envoyé au client (`livrables/talk/fiche-ouverture/`) ;
 * il la remplit et la renvoie enregistrée, ses réponses dans `<script id="reponses">`.
 *
 * **Le fichier vient de l'extérieur : il est lu, jamais exécuté.** `DOMParser` construit
 * un document inerte (aucun script ne tourne), on n'en prend que le texte du bloc JSON,
 * et chaque valeur est ramenée à une chaîne ou une liste de chaînes avant usage. Rien du
 * fichier n'est envoyé tel quel au serveur : seules les valeurs retenues passent par les
 * routes existantes, avec leurs gardes.
 */

export type SalleFiche = {
  type: string;
  nom: string;
  poste: string;
  robot: boolean;
};

export type SiteFiche = {
  nom: string;
  codeSite: string;
  prononce: string;
  adresse: string;
  cp: string;
  ville: string;
  tel: string;
  secretariat: string;
  mail: string;
  horaires: string;
  examens: string[];
  salles: SalleFiche[];
};

export type CompteFiche = {
  nom: string;
  mail: string;
  acces: string;
  site: string;
};

/** Organisation des sites, telle que la fiche la propose (partie 3). */
export type Schema = "A" | "B" | "C" | "D" | "Autre" | "";

export type Fiche = {
  centre: { nom: string; groupe: string };
  contact: { nom: string; fonction: string; mail: string; tel: string };
  informatique: { nom: string; mail: string; tel: string };
  xplore: {
    version: string;
    versionPrecise: string;
    hebergement: string;
    acces: string;
  };
  organisation: {
    nbSites: string;
    schema: Schema;
    numeros: string;
    remarque: string;
  };
  sites: SiteFiche[];
  robot: {
    examens: string[];
    actions: string[];
    services: string[];
    depassements: string;
    depassementsDetail: string;
  };
  telephone: {
    mode: string;
    operateur: string;
    contact: string;
    dedies: string;
  };
  comptes: CompteFiche[];
  remarques: string;
  rempliPar: string;
  rempliLe: string;
};

// ── Lecture défensive ────────────────────────────────────────────────────────

type Brut = Record<string, unknown>;

function objet(v: unknown): Brut {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Brut) : {};
}
function texte(v: unknown): string {
  return typeof v === "string"
    ? v.trim()
    : typeof v === "number"
      ? String(v)
      : "";
}
function textes(v: unknown): string[] {
  return Array.isArray(v) ? v.map(texte).filter(Boolean) : [];
}
function liste(v: unknown): Brut[] {
  return Array.isArray(v) ? v.map(objet) : [];
}

function versFiche(brut: Brut): Fiche {
  const c = objet(brut.centre);
  const ct = objet(brut.contact);
  const inf = objet(brut.informatique);
  const x = objet(brut.xplore);
  const o = objet(brut.organisation);
  const r = objet(brut.robot);
  const t = objet(brut.telephone);
  const schema = texte(o.schema);
  return {
    centre: { nom: texte(c.nom), groupe: texte(c.groupe) },
    contact: {
      nom: texte(ct.nom),
      fonction: texte(ct.fonction),
      mail: texte(ct.mail),
      tel: texte(ct.tel),
    },
    informatique: {
      nom: texte(inf.nom),
      mail: texte(inf.mail),
      tel: texte(inf.tel),
    },
    xplore: {
      version: texte(x.version),
      versionPrecise: texte(x.versionPrecise),
      hebergement: texte(x.hebergement),
      acces: texte(x.acces),
    },
    organisation: {
      nbSites: texte(o.nbSites),
      schema: (["A", "B", "C", "D", "Autre"].includes(schema)
        ? schema
        : "") as Schema,
      numeros: texte(o.numeros),
      remarque: texte(o.remarque),
    },
    sites: liste(brut.sites)
      .map((s) => ({
        nom: texte(s.nom),
        codeSite: texte(s.codeSite).toUpperCase(),
        prononce: texte(s.prononce),
        adresse: texte(s.adresse),
        cp: texte(s.cp),
        ville: texte(s.ville),
        tel: texte(s.tel),
        secretariat: texte(s.secretariat),
        mail: texte(s.mail),
        horaires: texte(s.horaires),
        examens: textes(s.examens),
        salles: liste(s.salles)
          .map((l) => ({
            type: texte(l.type),
            nom: texte(l.nom),
            poste: texte(l.poste).toUpperCase(),
            robot: l.robot !== false,
          }))
          .filter((l) => l.type || l.nom || l.poste),
      }))
      .filter((s) => s.nom || s.codeSite || s.adresse),
    robot: {
      examens: textes(r.examens),
      actions: textes(r.actions),
      services: textes(r.services),
      depassements: texte(r.depassements),
      depassementsDetail: texte(r.depassementsDetail),
    },
    telephone: {
      mode: texte(t.mode),
      operateur: texte(t.operateur),
      contact: texte(t.contact),
      dedies: texte(t.dedies),
    },
    comptes: liste(brut.comptes)
      .map((a) => ({
        nom: texte(a.nom),
        mail: texte(a.mail),
        acces: texte(a.acces),
        site: texte(a.site),
      }))
      .filter((a) => a.nom || a.mail),
    remarques: texte(brut.remarques),
    rempliPar: texte(brut.rempliPar),
    rempliLe: texte(brut.rempliLe),
  };
}

/**
 * Lit le HTML d'une fiche rendue. Lève une erreur au texte lisible si ce n'est pas une
 * fiche d'ouverture, ou si elle est vide.
 */
export function lireFiche(html: string): Fiche {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const bloc = doc.getElementById("reponses");
  if (!bloc) {
    throw new Error(
      "Ce fichier n'est pas une fiche d'ouverture : le bloc des réponses est introuvable.",
    );
  }
  let brut: unknown;
  try {
    brut = JSON.parse(bloc.textContent || "{}");
  } catch {
    throw new Error(
      "Les réponses de cette fiche sont illisibles. Demandez au client de l'enregistrer à nouveau.",
    );
  }
  const fiche = versFiche(objet(brut));
  if (!fiche.centre.nom && fiche.sites.length === 0) {
    throw new Error(
      "Cette fiche est vide : le client ne l'a pas remplie, ou c'est le modèle vierge.",
    );
  }
  return fiche;
}

// ── Les sites que porte ce compte ────────────────────────────────────────────

/**
 * Organisation D : un compte par site. Les autres : un compte pour tout, mais A et B ne
 * gardent que le premier site (B = plusieurs lieux sous un seul code site).
 */
export function unCompteParSite(fiche: Fiche): boolean {
  return fiche.organisation.schema === "D" && fiche.sites.length > 1;
}

export function sitesDuCompte(
  fiche: Fiche,
  indexSite: number | null,
): SiteFiche[] {
  if (fiche.sites.length === 0) return [];
  if (unCompteParSite(fiche))
    return [fiche.sites[indexSite ?? 0] ?? fiche.sites[0]];
  if (fiche.organisation.schema === "A" || fiche.organisation.schema === "B")
    return [fiche.sites[0]];
  return fiche.sites;
}

// ── Vers l'assistant ─────────────────────────────────────────────────────────

/** Libellés d'examen de la fiche → clé de l'assistant. « Autres » n'a pas d'équivalent. */
const EXAMEN_VERS_CLE: Record<string, CleExamen> = {
  Radiographie: "radiographie",
  Échographie: "echographie",
  Mammographie: "mammo",
  Scanner: "scanner",
  IRM: "irm",
};

/** Libellés d'examen de la fiche → code de type du robot (`risCode`, `sallesParType`). */
const EXAMEN_VERS_TYPE: Record<string, string> = {
  Radiographie: "RX",
  Échographie: "US",
  Mammographie: "MG",
  Scanner: "CT",
  IRM: "MR",
  Autre: "OT",
  Autres: "OT",
};

/** Ce que la fiche préremplit dans l'assistant. Rien n'est écrit à ce stade. */
export function preremplissage(
  fiche: Fiche,
  sites: SiteFiche[],
  actuelles: ReponsesTalk,
): { nom: string; reponses: ReponsesTalk } {
  const principal = sites[0];
  const examsAccepted = { ...actuelles.examsAccepted };
  if (fiche.robot.examens.length > 0) {
    for (const cle of Object.keys(examsAccepted) as CleExamen[])
      examsAccepted[cle] = false;
    for (const e of fiche.robot.examens) {
      const cle = EXAMEN_VERS_CLE[e];
      if (cle) examsAccepted[cle] = true;
    }
  }
  // En organisation D, le compte porte le nom du site ; sinon celui du centre.
  const nom =
    (sites.length === 1 && fiche.sites.length > 1
      ? principal?.nom
      : fiche.centre.nom) || fiche.centre.nom;
  return {
    nom,
    reponses: {
      ...actuelles,
      centerName: principal?.nom || fiche.centre.nom || actuelles.centerName,
      address: principal?.adresse || actuelles.address,
      address2:
        [principal?.cp, principal?.ville].filter(Boolean).join(" ") ||
        actuelles.address2,
      centerPhone: principal?.tel || actuelles.centerPhone,
      centerMail: principal?.mail || actuelles.centerMail,
      examsAccepted,
    },
  };
}

/** Un numéro français en forme internationale (+33…), comme le reste de `talk.site`. */
export function enInternational(numero: string): string {
  const n = numero.replace(/[\s.\-()/]/g, "");
  if (/^0[1-9]\d{8}$/.test(n)) return `+33${n.slice(1)}`;
  return n;
}

/**
 * Le bloc `talk.site` que la fiche permet d'écrire : codes sites par type, salles, noms
 * prononcés, fiches des sites secondaires, choix du site par le patient, secrétariat.
 *
 * Seules les clés qu'on sait remplir sont posées : une clé absente laisse au robot sa
 * valeur par défaut, une clé vide la lui retirerait.
 */
export function blocTalkSite(
  sites: SiteFiche[],
  examensDuRobot: string[],
  userProductId: number,
): Record<string, unknown> {
  const avecCode = sites.filter((s) => s.codeSite);
  if (avecCode.length === 0) return {};
  const principal = avecCode[0];
  const bloc: Record<string, unknown> = {};

  // Un type présent dans `risCode` est réservable : on n'y met que les examens que le
  // client confie au robot (partie 5), pas tous ceux que ses sites pratiquent.
  const confies = new Set(
    examensDuRobot
      .map((e) => EXAMEN_VERS_TYPE[e.split(" ")[0]])
      .filter(Boolean),
  );
  const garde = (type: string | undefined): type is string =>
    !!type && (confies.size === 0 || confies.has(type));

  const risCode: Record<string, unknown> = { info: principal.codeSite };
  for (const s of avecCode) {
    for (const e of s.examens) {
      const type = EXAMEN_VERS_TYPE[e];
      if (!garde(type)) continue;
      const codes = (risCode[type] as string[] | undefined) ?? [];
      if (!codes.includes(s.codeSite)) codes.push(s.codeSite);
      risCode[type] = codes;
    }
  }
  bloc.risCode = risCode;

  const salles: Record<string, { poste: string; libelle: string }[]> = {};
  for (const s of avecCode) {
    for (const l of s.salles) {
      const type = EXAMEN_VERS_TYPE[l.type];
      if (!garde(type) || !l.poste || !l.robot) continue;
      (salles[type] ??= []).push({
        poste: l.poste,
        libelle: (l.nom || l.poste).slice(0, 40),
      });
    }
  }
  if (Object.keys(salles).length > 0) bloc.sallesParType = salles;

  bloc.siteCodeToName = Object.fromEntries(
    avecCode.map((s) => [s.codeSite, s.prononce || s.nom]),
  );

  const secondaires = avecCode.slice(1);
  if (secondaires.length > 0) {
    bloc.siteDetails = Object.fromEntries(
      secondaires.map((s) => [
        s.codeSite,
        {
          centerName: s.nom,
          address: s.adresse,
          address2: [s.cp, s.ville].filter(Boolean).join(" "),
          phone: s.tel,
          mail: s.mail,
        },
      ]),
    );
    bloc.siteSelectionList = avecCode.map((s) => ({
      id: s.codeSite,
      nom: s.prononce || s.nom,
      userProductId,
    }));
  }

  if (principal.secretariat) {
    bloc.transferNumber = [
      {
        phone: enInternational(principal.secretariat),
        label: principal.nom || principal.codeSite,
      },
    ];
  }
  return bloc;
}
