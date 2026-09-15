/**
 * Les onglets du pack, et la route qui applique chacun (lot 4D).
 *
 * ## La règle qui tient tout le fichier
 *
 * **Une cellule vide n'efface jamais.** Une colonne absente non plus, et une ligne
 * absente non plus. C'est la règle de l'import du mapping, qui a fait ses preuves : un
 * tableur rend l'effacement involontaire trop facile, et un fichier tronqué ne doit pas
 * passer pour une intention. Pour retirer quelque chose, on le fait sur son écran.
 *
 * Conséquence directe sur les trois routes qui **remplacent tout** (`konnect-sites`,
 * `konnect-examens`) : l'import ne leur envoie pas les lignes du fichier, il leur
 * envoie **l'état courant fusionné avec** les lignes du fichier. Leur envoyer le
 * fichier seul supprimerait tout ce qu'il ne contient pas.
 *
 * ## Le classeur n'est pas l'agrégat
 *
 * L'agrégat (`GET /api/admin/pack`) est l'état courant du centre. Il sert à deux
 * choses : dire ce qui change, et réémettre intacts les champs qu'une route exige mais
 * que le pack ne montre pas (`reconnaissance`, `serviceEnabled`). Le classeur n'expose
 * que ce qui se remplit et se duplique.
 *
 * ## Chaque onglet passe par SA route
 *
 * Aucune écriture n'est faite ici ni dans une route de pack : on rend des descriptions
 * d'écriture, que l'écran exécute contre les routes existantes. Recopier une garde
 * dans une route de pack créerait un second endroit où elle peut diverger.
 */

import type { Pack } from "./types";
import { oui, texteBrut, versBooleen, versTexte, type Cellule, type Ligne } from "./classeur";
import { COMBOS, EXAMENS, JOURS, libelleCombo } from "@/lib/questionnaireTalk";
import { DOMAINES as DOMAINES_PRODUIT } from "@/lib/productConfig";

export type Ecriture = { url: string; methode: "POST" | "PUT"; corps: unknown };

export type Constat = {
  lues: number;
  modifiees: number;
  /** Les clés du fichier qui ne correspondent à rien. Jamais créées. */
  inconnues: string[];
  colonnesManquantes: string[];
  /** Ce qui mérite d'être dit sans empêcher d'appliquer. */
  remarques: string[];
  ecritures: Ecriture[];
};

export type Onglet = {
  cle: string;
  nom: string;
  produit: "talk" | "konnect";
  /** Une phrase, posée en tête de l'onglet nulle part : elle sert à l'écran. */
  aide: string;
  colonnes: string[];
  /** Les lignes à écrire dans le classeur. `null` si le centre n'a pas ce produit. */
  exporter: (pack: Pack) => Ligne[] | null;
  /** Rapproche le fichier avec l'état courant. `null` si le centre n'a pas ce produit. */
  importer: (lues: Ligne[], colonnes: string[], pack: Pack) => Constat | null;
};

const constatVide = (): Constat => ({
  lues: 0,
  modifiees: 0,
  inconnues: [],
  colonnesManquantes: [],
  remarques: [],
  ecritures: [],
});

/* ───────────────────────────── Les feuilles de réglages ───────────────────────────── */

/**
 * Un réglage d'une feuille en clé / valeur.
 *
 * `champ` peut être pointé (`options.motif`) pour viser une clé imbriquée : c'est le cas
 * des trois questions du robot, qui vivent dans une seule colonne JSON.
 */
type Reglage = {
  libelle: string;
  aide: string;
  champ: string;
  type: "texte" | "booleen" | "nombre" | "choix";
  /** Pour `choix` : les valeurs acceptées, et leur libellé lisible. */
  choix?: { valeur: string; libelle: string }[];
};

const COLONNES_REGLAGES = ["Réglage", "Valeur", "À quoi ça sert"];

function lireChamp(source: Record<string, any>, champ: string): unknown {
  return champ.split(".").reduce<any>((o, k) => (o == null ? undefined : o[k]), source);
}

function poserChamp(cible: Record<string, any>, champ: string, valeur: unknown): void {
  const morceaux = champ.split(".");
  let courant = cible;
  for (const k of morceaux.slice(0, -1)) {
    if (typeof courant[k] !== "object" || courant[k] === null) courant[k] = {};
    courant = courant[k];
  }
  courant[morceaux[morceaux.length - 1]] = valeur;
}

/**
 * La valeur de référence, mise dans la forme que le classeur lui donnerait.
 *
 * `null`, `undefined` et `""` désignent la même absence côté base ; le classeur ne sait
 * écrire que `""`. Sans cette mise à plat, l'aller-retour d'un pack intact annonce une
 * modification par champ vide.
 */
function normaliserValeur(reglage: Reglage, brut: unknown): unknown {
  if (reglage.type === "booleen") return brut === true;
  if (reglage.type === "nombre") return brut === null || brut === undefined || brut === "" ? null : Number(brut);
  return brut === null || brut === undefined ? "" : String(brut);
}

function celluleDe(reglage: Reglage, source: Record<string, any>): Cellule {
  const v = lireChamp(source, reglage.champ);
  if (reglage.type === "booleen") return oui(v === true);
  if (reglage.type === "nombre") return v === null || v === undefined ? "" : Number(v);
  if (reglage.type === "choix") {
    return reglage.choix?.find((c) => c.valeur === v)?.libelle ?? String(v ?? "");
  }
  return v === null || v === undefined ? "" : String(v);
}

function exporterReglages(reglages: Reglage[], source: Record<string, any>): Ligne[] {
  return reglages.map((r) => ({
    "Réglage": r.libelle,
    "Valeur": celluleDe(r, source),
    "À quoi ça sert": r.aide,
  }));
}

/**
 * Rapproche une feuille de réglages avec l'état courant.
 *
 * La clé est le libellé de la colonne « Réglage ». Un libellé inconnu est signalé, pas
 * appliqué : il vient d'un pack plus ancien ou d'une ligne ajoutée à la main.
 */
function importerReglages(
  reglages: Reglage[],
  lues: Ligne[],
  source: Record<string, any>,
  construireCorps: (modifications: Record<string, any>) => Ecriture | null
): Constat {
  const c = constatVide();
  c.lues = lues.length;
  const parLibelle = new Map(reglages.map((r) => [r.libelle.toLowerCase(), r]));
  const modifications: Record<string, any> = {};

  for (const ligne of lues) {
    const libelle = texteBrut(ligne["Réglage"]).toLowerCase();
    if (libelle === "") continue;
    const reglage = parLibelle.get(libelle);
    if (!reglage) {
      c.inconnues.push(texteBrut(ligne["Réglage"]));
      continue;
    }
    const brut = ligne["Valeur"];
    /**
     * ⚠️ On compare des valeurs NORMALISÉES, pas la cellule avec la valeur brute.
     *
     * Un champ texte vide vaut `null` en base et `""` dans le classeur. Comparer les
     * deux formes faisait voir une modification à chaque aller-retour : exporter un
     * pack puis le réimporter sans y toucher annonçait onze changements, dont aucun
     * n'en était un. Le champ de référence est donc mis dans la forme du classeur
     * avant d'être comparé.
     */
    const actuel = normaliserValeur(reglage, lireChamp(source, reglage.champ));
    let nouvelle: unknown;

    if (reglage.type === "booleen") {
      nouvelle = versBooleen(brut, actuel === true);
    } else if (reglage.type === "nombre") {
      const t = versTexte(brut, actuel === null ? "" : String(actuel));
      // Une case vide laisse la valeur en place ; une case illisible aussi, plutôt que
      // d'envoyer un NaN que la route refuserait sans qu'on sache quelle ligne blâmer.
      const n = t === "" ? null : Number(t.replace(",", "."));
      nouvelle = n === null || Number.isNaN(n) ? actuel : n;
    } else if (reglage.type === "choix") {
      const t = texteBrut(brut);
      if (t === "") {
        nouvelle = actuel;
      } else {
        const trouve = reglage.choix?.find(
          (x) => x.libelle.toLowerCase() === t.toLowerCase() || x.valeur.toLowerCase() === t.toLowerCase()
        );
        if (!trouve) {
          c.remarques.push(`« ${reglage.libelle} » : « ${t} » n'est pas une valeur connue, la valeur en place est gardée.`);
          nouvelle = actuel;
        } else {
          nouvelle = trouve.valeur;
        }
      }
    } else {
      nouvelle = versTexte(brut, actuel === null ? "" : String(actuel));
    }

    if (nouvelle !== actuel) {
      poserChamp(modifications, reglage.champ, nouvelle);
      c.modifiees += 1;
    }
  }

  if (c.modifiees > 0) {
    const e = construireCorps(modifications);
    if (e) c.ecritures.push(e);
  }
  return c;
}

/* ───────────────────────────── Les réglages, produit par produit ───────────────────────────── */

const REGLAGES_CENTRE: Reglage[] = [
  { libelle: "Nom du centre", aide: "Ce que le robot dit au patient.", champ: "centerName", type: "texte" },
  { libelle: "Adresse", aide: "Rue et numéro.", champ: "address", type: "texte" },
  { libelle: "Code postal et ville", aide: "Les deux dans la même case.", champ: "address2", type: "texte" },
  { libelle: "Téléphone du centre", aide: "Dix chiffres.", champ: "centerPhone", type: "texte" },
  { libelle: "Adresse mail", aide: "Celle que le robot donne au patient.", champ: "centerMail", type: "texte" },
  { libelle: "Site web", aide: "Facultatif.", champ: "centerWebsite", type: "texte" },
  { libelle: "Nom du robot", aide: "Le prénom qu'il se donne en décrochant.", champ: "botName", type: "texte" },
  {
    libelle: "Voix",
    aide: "La voix de synthèse.",
    champ: "voice",
    type: "choix",
    choix: [
      { valeur: "femme", libelle: "Femme" },
      { valeur: "homme", libelle: "Homme" },
    ],
  },
  {
    libelle: "Mode de décroché",
    aide: "Le robot décroche, ou il ne prend que les appels en débordement.",
    champ: "callMode",
    type: "choix",
    choix: [
      { valeur: "decroche", libelle: "Décroché" },
      { valeur: "debordement", libelle: "Débordement" },
    ],
  },
  { libelle: "Message d'accueil", aide: "La première phrase de l'appel.", champ: "welcomeMsg", type: "texte" },
  { libelle: "Urgences hors horaires", aide: "Ce que le robot dit quand le centre est fermé.", champ: "emergencyOutOfHours", type: "texte" },
  { libelle: "Consignes particulières", aide: "Parking, accès, étage.", champ: "specificNotes", type: "texte" },
  { libelle: "Demander le motif de l'ordonnance", aide: "Il part dans le commentaire du rendez-vous.", champ: "options.motif", type: "booleen" },
  { libelle: "Poser les questions avant le rendez-vous", aide: "Pour préparer la venue du patient.", champ: "options.questions", type: "booleen" },
  { libelle: "Demander la date des dernières règles", aide: "Mammographie uniquement.", champ: "options.menstruations", type: "booleen" },
];

const REGLAGES_SMS: Reglage[] = [
  { libelle: "Envoyer le SMS de confirmation", aide: "Il porte aussi le lien de dépôt d'ordonnance.", champ: "sendConfirmationSms", type: "booleen" },
  { libelle: "Rappel combien de jours avant", aide: "Nombre de jours.", champ: "reminderDays", type: "nombre" },
  { libelle: "Heure limite de réponse", aide: "Nombre d'heures avant le rendez-vous.", champ: "cutoffHours", type: "nombre" },
];

const REGLAGES_PORTAIL: Reglage[] = [
  { libelle: "Téléphone du secrétariat", aide: "Affiché au patient dont le rendez-vous est bloqué.", champ: "telephoneSecretariat", type: "texte" },
  { libelle: "Couleur principale", aide: "Code hexadécimal, par exemple #0F2A3F.", champ: "couleurPrincipale", type: "texte" },
  { libelle: "Couleur secondaire", aide: "Code hexadécimal.", champ: "couleurSecondaire", type: "texte" },
  { libelle: "Dépassement d'honoraires", aide: "Ce que le patient lit avant de réserver.", champ: "depassementHonoraires", type: "texte" },
  { libelle: "Consignes générales", aide: "Affichées sur le portail.", champ: "consignesGenerales", type: "texte" },
  { libelle: "Envoyer les confirmations par mail", aide: "", champ: "envoiEmail", type: "booleen" },
  { libelle: "Envoyer les confirmations par SMS", aide: "", champ: "envoiSms", type: "booleen" },
  { libelle: "Rappels actifs", aide: "", champ: "rappelsActifs", type: "booleen" },
  { libelle: "Lecture de l'ordonnance", aide: "Le patient peut déposer son ordonnance.", champ: "ocrActif", type: "booleen" },
  {
    libelle: "Mode de choix de l'examen",
    aide: "Liste, ou schéma du corps.",
    champ: "modeSaisieExamen",
    type: "choix",
    choix: [
      { valeur: "traditionnel", libelle: "Liste" },
      { valeur: "anatomique", libelle: "Schéma du corps" },
    ],
  },
  { libelle: "Le patient choisit son radiologue", aide: "", champ: "choixRadiologueActif", type: "booleen" },
  { libelle: "Plusieurs examens dans la même visite", aide: "", champ: "multiExamenActif", type: "booleen" },
  { libelle: "Questions de sécurité avant le rendez-vous", aide: "Exige un téléphone de secrétariat.", champ: "cliniqueActif", type: "booleen" },
  { libelle: "Poids maximum en IRM", aide: "En kilos.", champ: "poidsMaxIrmKg", type: "nombre" },
  { libelle: "Poids maximum au scanner", aide: "En kilos.", champ: "poidsMaxScannerKg", type: "nombre" },
  { libelle: "Le patient peut annuler seul", aide: "", champ: "annulationDirecte", type: "booleen" },
  {
    libelle: "Quand envoyer le SMS de rappel",
    aide: "",
    champ: "smsRappelMode",
    type: "choix",
    choix: [
      { valeur: "conditionnel", libelle: "Selon le cas" },
      { valeur: "opt_out_si_ics", libelle: "Sauf si le patient a l'agenda" },
      { valeur: "toujours", libelle: "Toujours" },
    ],
  },
  { libelle: "Code de confirmation dans le logiciel du centre", aide: "", champ: "codeCaracteristiqueConfirmationXplore", type: "texte" },
];

/* ───────────────────────────── Les feuilles en lignes ───────────────────────────── */

const LIBELLE_CONDUITE = { redirection: "Transfert", fin_appel: "Fin d'appel" } as const;

/** La conduite telle que le classeur la rend : type explicite, champ vide plutôt qu'absent. */
function conduiteNormalisee(v: { type?: string; message?: string; phone?: string } | undefined) {
  const type = v?.type === "redirection" ? "redirection" : "fin_appel";
  return type === "redirection"
    ? { type, phone: v?.phone ?? "" }
    : { type, message: v?.message ?? "" };
}

/** « 08:00-12:00, 14:00-18:00 » : une seule colonne pour un nombre de plages variable. */
function plagesVersTexte(ranges: { start: string; end: string }[]): string {
  return ranges.map((p) => `${p.start}-${p.end}`).join(", ");
}

function texteVersPlages(brut: string): { start: string; end: string }[] | null {
  const morceaux = brut.split(",").map((m) => m.trim()).filter(Boolean);
  const plages: { start: string; end: string }[] = [];
  for (const m of morceaux) {
    const [a, b] = m.split("-").map((x) => x.trim());
    if (!/^\d{1,2}:\d{2}$/.test(a ?? "") || !/^\d{1,2}:\d{2}$/.test(b ?? "")) return null;
    plages.push({ start: a.padStart(5, "0"), end: b.padStart(5, "0") });
  }
  return plages;
}

/* ───────────────────────────── Le registre ───────────────────────────── */

export const ONGLETS: Onglet[] = [
  {
    cle: "centre",
    nom: "Centre",
    produit: "talk",
    aide: "L'identité du centre et ce que le robot dit au patient.",
    colonnes: COLONNES_REGLAGES,
    exporter: (pack) => (pack.talk ? exporterReglages(REGLAGES_CENTRE, pack.talk) : null),
    importer: (lues, _colonnes, pack) => {
      const t = pack.talk;
      if (!t) return null;
      return importerReglages(REGLAGES_CENTRE, lues, t, (mods) => ({
        url: "/api/configuration",
        methode: "POST",
        corps: {
          userProductId: t.userProductId,
          // ⚠️ `reconnaissance` est EXIGÉ par la route, et son GET ne le rend pas. On
          // réémet celui de l'agrégat : c'est un interrupteur d'exploitation, il ne se
          // duplique pas.
          reconnaissance: t.reconnaissance,
          ...mods,
          // ⚠️ `options` est une colonne JSON entière. Sans cette fusion sur l'objet
          // courant, un import effacerait `serviceEnabled`.
          ...(mods.options ? { options: { ...t.options, ...mods.options } } : {}),
        },
      }));
    },
  },

  {
    cle: "horaires",
    nom: "Horaires",
    produit: "talk",
    aide: "Une ligne par jour. Plusieurs plages se séparent par une virgule.",
    colonnes: ["Jour", "Ouvert", "Plages"],
    exporter: (pack) => {
      if (!pack.talk) return null;
      return JOURS.map((j) => {
        const jour = pack.talk!.weeklyHours[j.cle] ?? { enabled: false, ranges: [] };
        return {
          Jour: j.libelle,
          Ouvert: oui(jour.enabled),
          Plages: plagesVersTexte(jour.ranges),
        };
      });
    },
    importer: (lues, colonnes, pack) => {
      const t = pack.talk;
      if (!t) return null;
      const c = constatVide();
      c.lues = lues.length;
      c.colonnesManquantes = ["Ouvert", "Plages"].filter((x) => !colonnes.includes(x));

      const parLibelle = new Map(JOURS.map((j) => [j.libelle.toLowerCase(), j.cle]));
      const semaine = { ...t.weeklyHours };
      let change = false;

      for (const ligne of lues) {
        const libelle = texteBrut(ligne.Jour).toLowerCase();
        if (libelle === "") continue;
        const cle = parLibelle.get(libelle);
        if (!cle) {
          c.inconnues.push(texteBrut(ligne.Jour));
          continue;
        }
        const actuel = semaine[cle] ?? { enabled: false, ranges: [] };
        const ouvert = colonnes.includes("Ouvert")
          ? versBooleen(ligne.Ouvert, actuel.enabled)
          : actuel.enabled;

        let plages = actuel.ranges;
        if (colonnes.includes("Plages")) {
          const brut = texteBrut(ligne.Plages);
          if (brut !== "") {
            const lues2 = texteVersPlages(brut);
            if (lues2 === null) {
              c.remarques.push(`${texteBrut(ligne.Jour)} : « ${brut} » ne se lit pas. Attendu : 08:00-12:00, 14:00-18:00.`);
            } else {
              plages = lues2;
            }
          }
        }

        const nouveau = { enabled: ouvert, ranges: plages };
        if (JSON.stringify(nouveau) !== JSON.stringify(actuel)) {
          semaine[cle] = nouveau;
          c.modifiees += 1;
          change = true;
        }
      }

      if (change) {
        c.ecritures.push({
          url: "/api/configuration/informationnel/horaires",
          methode: "POST",
          corps: { userProductId: t.userProductId, weeklyHours: semaine },
        });
      }
      return c;
    },
  },

  {
    cle: "examens",
    nom: "Examens",
    produit: "talk",
    aide: "Les examens confiés au robot, et ce qu'il fait quand le planning est complet.",
    colonnes: ["Examen", "Confié au robot", "Planning complet", "Numéro de transfert", "Message de fin d'appel"],
    exporter: (pack) => {
      if (!pack.talk) return null;
      return EXAMENS.map((e) => {
        const conduite = pack.talk!.fullPlanningNotes[e.cle] ?? {};
        const type = conduite.type === "redirection" ? "redirection" : "fin_appel";
        return {
          Examen: e.libelle,
          "Confié au robot": oui(pack.talk!.examsAccepted[e.cle] === true),
          "Planning complet": LIBELLE_CONDUITE[type],
          "Numéro de transfert": conduite.phone ?? "",
          "Message de fin d'appel": conduite.message ?? "",
        };
      });
    },
    importer: (lues, colonnes, pack) => {
      const t = pack.talk;
      if (!t) return null;
      const c = constatVide();
      c.lues = lues.length;
      c.colonnesManquantes = ["Confié au robot", "Planning complet"].filter((x) => !colonnes.includes(x));

      const parLibelle = new Map(EXAMENS.map((e) => [e.libelle.toLowerCase(), e.cle]));
      const acceptes = { ...t.examsAccepted };
      const conduites = { ...t.fullPlanningNotes };
      let change = false;

      for (const ligne of lues) {
        const libelle = texteBrut(ligne.Examen).toLowerCase();
        if (libelle === "") continue;
        const cle = parLibelle.get(libelle);
        if (!cle) {
          c.inconnues.push(texteBrut(ligne.Examen));
          continue;
        }

        // ⚠️ La conduite de référence est normalisée avant comparaison. Un examen sans
        // conduite enregistrée s'exporte comme « fin d'appel, message vide » : comparer
        // cette forme à un `undefined` faisait voir quatre modifications à chaque
        // aller-retour d'un pack intact.
        const avant = JSON.stringify([acceptes[cle] === true, conduiteNormalisee(conduites[cle])]);

        if (colonnes.includes("Confié au robot")) {
          acceptes[cle] = versBooleen(ligne["Confié au robot"], acceptes[cle] === true);
        }

        const actuelle = conduites[cle] ?? {};
        const typeActuel = actuelle.type === "redirection" ? "redirection" : "fin_appel";
        let type = typeActuel;
        if (colonnes.includes("Planning complet")) {
          const brut = texteBrut(ligne["Planning complet"]).toLowerCase();
          if (brut.startsWith("transf") || brut.startsWith("redir")) type = "redirection";
          else if (brut.startsWith("fin")) type = "fin_appel";
        }
        // Le champ suit le type : garder un numéro sous une fin d'appel laisserait une
        // valeur que rien ne lit, et qui réapparaîtrait au prochain export.
        conduites[cle] =
          type === "redirection"
            ? { type, phone: versTexte(ligne["Numéro de transfert"], actuelle.phone ?? "") }
            : { type, message: versTexte(ligne["Message de fin d'appel"], actuelle.message ?? "") };

        if (JSON.stringify([acceptes[cle] === true, conduiteNormalisee(conduites[cle])]) !== avant) {
          c.modifiees += 1;
          change = true;
        }
      }

      if (change) {
        c.ecritures.push({
          url: "/api/configuration",
          methode: "POST",
          corps: {
            userProductId: t.userProductId,
            reconnaissance: t.reconnaissance,
            examsAccepted: acceptes,
            fullPlanningNotes: conduites,
          },
        });
      }
      return c;
    },
  },

  {
    cle: "doubles",
    nom: "Doubles examens",
    produit: "talk",
    aide: "Les paires d'examens acceptées dans la même visite. La clé ne se modifie pas.",
    colonnes: ["Clé", "Combinaison", "Accepté", "Écriture dans le logiciel du centre"],
    exporter: (pack) => {
      if (!pack.talk) return null;
      return COMBOS.map((combo) => {
        const v = pack.talk!.multiExamMapping[combo.cle] ?? {};
        return {
          "Clé": combo.cle,
          Combinaison: libelleCombo(combo),
          "Accepté": oui(v.enabled === true),
          "Écriture dans le logiciel du centre":
            v.mode === "double" ? "Deux examens distincts" : "Un examen et un commentaire",
        };
      });
    },
    importer: (lues, colonnes, pack) => {
      const t = pack.talk;
      if (!t) return null;
      const c = constatVide();
      c.lues = lues.length;
      c.colonnesManquantes = ["Accepté"].filter((x) => !colonnes.includes(x));

      const connues = new Set(COMBOS.map((x) => x.cle));
      const carte: Record<string, { enabled: boolean; mode: string }> = {};
      for (const [k, v] of Object.entries(t.multiExamMapping)) {
        carte[k] = { enabled: v.enabled === true, mode: v.mode === "double" ? "double" : "single" };
      }
      let change = false;

      for (const ligne of lues) {
        const cle = texteBrut(ligne["Clé"]);
        if (cle === "") continue;
        // ⚠️ Une clé que la table de traduction du serveur ne connaît pas est ignorée
        // SANS ERREUR par la route. La refuser ici est la seule façon de le dire.
        if (!connues.has(cle)) {
          c.inconnues.push(cle);
          continue;
        }
        const actuel = carte[cle] ?? { enabled: false, mode: "single" };
        const accepte = colonnes.includes("Accepté")
          ? versBooleen(ligne["Accepté"], actuel.enabled)
          : actuel.enabled;

        let mode = actuel.mode;
        if (colonnes.includes("Écriture dans le logiciel du centre")) {
          const brut = texteBrut(ligne["Écriture dans le logiciel du centre"]).toLowerCase();
          if (brut.startsWith("deux") || brut === "double") mode = "double";
          else if (brut.startsWith("un ") || brut === "single") mode = "single";
        }

        const nouveau = { enabled: accepte, mode };
        if (JSON.stringify(nouveau) !== JSON.stringify(actuel)) {
          carte[cle] = nouveau;
          c.modifiees += 1;
          change = true;
        }
      }

      if (change) {
        c.ecritures.push({
          url: `/api/configuration/mapping/double_exam?userProductId=${t.userProductId}`,
          methode: "POST",
          corps: carte,
        });
      }
      return c;
    },
  },

  {
    cle: "mapping-talk",
    nom: "Mapping examens",
    produit: "talk",
    aide: "Les codes du logiciel du centre, en face de chaque examen. Le code NEURACORP ne se modifie pas.",
    colonnes: [
      "Code NEURACORP",
      "Examen",
      "Code RIS",
      "Code RIS avec injection",
      "Type RIS",
      "Libellé affiché au patient",
      "Attribué à Lyrae",
    ],
    exporter: (pack) => {
      if (!pack.talk) return null;
      return pack.talk.exams.map((e) => ({
        "Code NEURACORP": String(e.codeExamen ?? ""),
        Examen: String(e.libelle ?? ""),
        "Code RIS": String(e.codeExamenClient ?? ""),
        "Code RIS avec injection": String(e.codeExamenClientInject ?? ""),
        "Type RIS": String(e.typeExamenClient ?? ""),
        "Libellé affiché au patient": String(e.libelleClient ?? ""),
        "Attribué à Lyrae": oui(e.performed !== false),
      }));
    },
    importer: (lues, colonnes, pack) => {
      const t = pack.talk;
      if (!t) return null;
      const c = constatVide();
      c.lues = lues.length;
      const champs: { colonne: string; cle: string; type: "texte" | "booleen" }[] = [
        { colonne: "Code RIS", cle: "codeExamenClient", type: "texte" },
        { colonne: "Code RIS avec injection", cle: "codeExamenClientInject", type: "texte" },
        { colonne: "Type RIS", cle: "typeExamenClient", type: "texte" },
        { colonne: "Libellé affiché au patient", cle: "libelleClient", type: "texte" },
        { colonne: "Attribué à Lyrae", cle: "performed", type: "booleen" },
      ];
      c.colonnesManquantes = champs.map((x) => x.colonne).filter((x) => !colonnes.includes(x));

      const parCode = new Map(t.exams.map((e) => [String(e.codeExamen ?? ""), e]));
      const misAJour = new Map<string, Record<string, unknown>>();

      for (const ligne of lues) {
        const code = texteBrut(ligne["Code NEURACORP"]);
        if (code === "") continue;
        const actuelle = parCode.get(code);
        // Le catalogue vient du référentiel : on n'ajoute pas un examen par un tableur.
        if (!actuelle) {
          c.inconnues.push(code);
          continue;
        }
        const base = misAJour.get(code) ?? actuelle;
        const maj: Record<string, unknown> = { ...base };
        for (const champ of champs) {
          if (!colonnes.includes(champ.colonne)) continue;
          // ⚠️ On ne pose la clé que si la valeur CHANGE. La poser systématiquement
          // ajoutait `codeExamenClientInject: ""` à des lignes qui n'avaient jamais eu
          // ce champ, et l'aller-retour d'un pack intact annonçait deux modifications.
          if (champ.type === "booleen") {
            const actuelB = base[champ.cle] !== false;
            const nouveauB = versBooleen(ligne[champ.colonne], actuelB);
            if (nouveauB !== actuelB) maj[champ.cle] = nouveauB;
          } else {
            const actuelT = String(base[champ.cle] ?? "");
            const nouveauT = versTexte(ligne[champ.colonne], actuelT);
            if (nouveauT !== actuelT) maj[champ.cle] = nouveauT;
          }
        }
        misAJour.set(code, maj);
      }

      // Toutes les lignes repartent : la route fusionne par code NEURACORP, et lui
      // envoyer seulement les lignes touchées la ferait écrire un catalogue amputé.
      const fusionnees = t.exams.map((e) => misAJour.get(String(e.codeExamen ?? "")) ?? e);
      c.modifiees = fusionnees.filter((l, i) => JSON.stringify(l) !== JSON.stringify(t.exams[i])).length;

      if (c.modifiees > 0) {
        c.ecritures.push({
          url: "/api/configuration/mapping",
          methode: "POST",
          corps: { userProductId: t.userProductId, data: fusionnees },
        });
      }
      return c;
    },
  },

  {
    cle: "faq",
    nom: "Questions fréquentes",
    produit: "talk",
    aide: "Ce que le robot sait répondre. L'import AJOUTE les questions absentes, il n'en modifie ni n'en supprime aucune.",
    colonnes: ["Question", "Réponse", "Catégorie"],
    exporter: (pack) => {
      if (!pack.talk) return null;
      return pack.talk.faq.map((f) => ({
        Question: f.question,
        "Réponse": f.reponse,
        "Catégorie": f.categorie ?? "",
      }));
    },
    importer: (lues, colonnes, pack) => {
      const t = pack.talk;
      if (!t) return null;
      const c = constatVide();
      c.lues = lues.length;
      c.colonnesManquantes = ["Question", "Réponse"].filter((x) => !colonnes.includes(x));

      /**
       * ⚠️ AJOUT SEULEMENT, et c'est assumé.
       *
       * Modifier une question depuis un tableur demanderait de l'identifier autrement
       * que par son texte, donc d'exposer son numéro interne dans une colonne que
       * personne ne saurait remplir. Supprimer demanderait de traiter l'absence d'une
       * ligne comme une intention, ce que le pack refuse partout ailleurs. Une question
       * se corrige sur son écran ; le pack sert à en installer un jeu d'un coup.
       */
      const existantes = new Set(t.faq.map((f) => f.question.trim().toLowerCase()));
      for (const ligne of lues) {
        const question = texteBrut(ligne.Question);
        const reponse = texteBrut(ligne["Réponse"]);
        if (question === "" || reponse === "") continue;
        if (existantes.has(question.toLowerCase())) continue;
        existantes.add(question.toLowerCase());
        c.modifiees += 1;
        c.ecritures.push({
          url: "/api/module-info/items",
          methode: "POST",
          corps: {
            userProductId: t.userProductId,
            question,
            reponse,
            categorie: texteBrut(ligne["Catégorie"]) || null,
          },
        });
      }
      if (c.modifiees > 0) {
        c.remarques.push(
          `${c.modifiees} question(s) seront ajoutées. Les questions déjà présentes ne sont ni modifiées ni supprimées.`
        );
      }
      return c;
    },
  },

  {
    cle: "sms",
    nom: "SMS",
    produit: "talk",
    aide: "Le SMS de confirmation et son rappel. Les types d'examens concernés se règlent sur leur écran.",
    colonnes: COLONNES_REGLAGES,
    exporter: (pack) =>
      pack.talk
        ? exporterReglages(
            REGLAGES_SMS,
            pack.talk.sms ?? { sendConfirmationSms: false, reminderDays: null, cutoffHours: null }
          )
        : null,
    importer: (lues, _colonnes, pack) => {
      const t = pack.talk;
      if (!t) return null;
      const source = t.sms ?? { sendConfirmationSms: false, reminderDays: null, cutoffHours: null };
      return importerReglages(REGLAGES_SMS, lues, source, (mods) => ({
        url: "/api/sms-confirmation-config",
        methode: "POST",
        // La route accepte une mise à jour partielle : on n'envoie que ce qui change.
        corps: { userProductId: t.userProductId, ...mods },
      }));
    },
  },

  {
    cle: "portail",
    nom: "Portail",
    produit: "konnect",
    aide: "Les paramètres du portail patient. Le consentement à la lecture des ordonnances n'y figure pas.",
    colonnes: COLONNES_REGLAGES,
    exporter: (pack) => (pack.konnect ? exporterReglages(REGLAGES_PORTAIL, pack.konnect.parametres) : null),
    importer: (lues, _colonnes, pack) => {
      const k = pack.konnect;
      if (!k) return null;
      return importerReglages(REGLAGES_PORTAIL, lues, k.parametres, (mods) => ({
        url: `/api/konnect-configuration?userProductId=${k.userProductId}`,
        methode: "PUT",
        // La route fusionne déjà sur l'existant : on n'envoie que ce qui change.
        corps: mods,
      }));
    },
  },

  {
    cle: "portail-sites",
    nom: "Portail sites",
    produit: "konnect",
    aide: "Les lieux du cabinet. Une ligne absente du fichier n'est pas supprimée.",
    colonnes: ["Identifiant du site", "Libellé", "Adresse", "Code postal"],
    exporter: (pack) =>
      pack.konnect
        ? pack.konnect.sites.map((s) => ({
            "Identifiant du site": s.siteId,
            "Libellé": s.libelle,
            Adresse: s.adresse,
            "Code postal": s.codePostal,
          }))
        : null,
    importer: (lues, colonnes, pack) => {
      const k = pack.konnect;
      if (!k) return null;
      const c = constatVide();
      c.lues = lues.length;
      c.colonnesManquantes = ["Libellé", "Adresse", "Code postal"].filter((x) => !colonnes.includes(x));

      /**
       * ⚠️ `PUT /api/konnect-sites` REMPLACE toute la liste.
       *
       * On lui envoie donc l'existant fusionné avec le fichier, jamais le fichier seul :
       * un fichier auquel il manque une ligne supprimerait ce site, alors que le pack
       * promet partout ailleurs qu'une absence n'efface rien. Retirer un site se fait
       * sur son écran.
       */
      const parId = new Map(k.sites.map((s) => [s.siteId, { ...s }]));
      for (const ligne of lues) {
        const id = texteBrut(ligne["Identifiant du site"]);
        if (id === "") continue;
        const actuel = parId.get(id);
        const nouveau = {
          siteId: id,
          libelle: actuel ? versTexte(ligne["Libellé"], actuel.libelle) : texteBrut(ligne["Libellé"]),
          adresse: actuel ? versTexte(ligne.Adresse, actuel.adresse) : texteBrut(ligne.Adresse),
          codePostal: actuel
            ? versTexte(ligne["Code postal"], actuel.codePostal)
            : texteBrut(ligne["Code postal"]),
        };
        // ⚠️ Champ par champ, jamais par `JSON.stringify` : la ligne lue en base et la
        // ligne reconstruite ici n'ont pas leurs clés dans le même ordre, et la
        // comparaison textuelle voyait une modification sur un site inchangé.
        const identique =
          actuel !== undefined &&
          actuel.libelle === nouveau.libelle &&
          actuel.adresse === nouveau.adresse &&
          actuel.codePostal === nouveau.codePostal;
        if (!identique) c.modifiees += 1;
        parId.set(id, nouveau);
      }

      if (c.modifiees > 0) {
        c.ecritures.push({
          url: `/api/konnect-sites?userProductId=${k.userProductId}`,
          methode: "PUT",
          corps: { sites: [...parId.values()] },
        });
      }
      return c;
    },
  },

  {
    cle: "portail-examens",
    nom: "Portail examens",
    produit: "konnect",
    aide: "Le catalogue du portail. Le code NEURACORP ne se modifie pas, et un code inconnu n'est jamais créé.",
    colonnes: [
      "Code NEURACORP",
      "Examen",
      "Code RIS",
      "Code RIS avec injection",
      "Type RIS",
      "Libellé affiché au patient",
      "Proposé au patient",
      "Réservable en ligne",
      "Ordonnance obligatoire",
      "Injecté",
      "Liste d'attente",
    ],
    exporter: (pack) =>
      pack.konnect
        ? pack.konnect.examens.map((e) => ({
            "Code NEURACORP": e.codeExamen,
            Examen: e.libelle ?? "",
            "Code RIS": e.codeExamenClient,
            "Code RIS avec injection": e.codeExamenInjection,
            "Type RIS": e.typeExamenClient,
            "Libellé affiché au patient": e.libelleClient,
            "Proposé au patient": oui(e.performed),
            "Réservable en ligne": oui(e.reservableEnLigne),
            "Ordonnance obligatoire": oui(e.ordoOblig),
            "Injecté": oui(e.examenInjecte),
            "Liste d'attente": oui(e.listeAttenteActive),
          }))
        : null,
    importer: (lues, colonnes, pack) => {
      const k = pack.konnect;
      if (!k) return null;
      const c = constatVide();
      c.lues = lues.length;
      const champs: { colonne: string; cle: string; type: "texte" | "booleen" }[] = [
        { colonne: "Code RIS", cle: "codeExamenClient", type: "texte" },
        { colonne: "Code RIS avec injection", cle: "codeExamenInjection", type: "texte" },
        { colonne: "Type RIS", cle: "typeExamenClient", type: "texte" },
        { colonne: "Libellé affiché au patient", cle: "libelleClient", type: "texte" },
        { colonne: "Proposé au patient", cle: "performed", type: "booleen" },
        { colonne: "Réservable en ligne", cle: "reservableEnLigne", type: "booleen" },
        { colonne: "Ordonnance obligatoire", cle: "ordoOblig", type: "booleen" },
        { colonne: "Injecté", cle: "examenInjecte", type: "booleen" },
        { colonne: "Liste d'attente", cle: "listeAttenteActive", type: "booleen" },
      ];
      c.colonnesManquantes = champs.map((x) => x.colonne).filter((x) => !colonnes.includes(x));

      const parCode = new Map(k.examens.map((e) => [e.codeExamen, { ...e } as Record<string, any>]));
      let change = false;

      for (const ligne of lues) {
        const code = texteBrut(ligne["Code NEURACORP"]);
        if (code === "") continue;
        const actuelle = parCode.get(code);
        if (!actuelle) {
          c.inconnues.push(code);
          continue;
        }
        const avant = JSON.stringify(actuelle);
        for (const champ of champs) {
          if (!colonnes.includes(champ.colonne)) continue;
          actuelle[champ.cle] =
            champ.type === "booleen"
              ? versBooleen(ligne[champ.colonne], actuelle[champ.cle] !== false)
              : versTexte(ligne[champ.colonne], String(actuelle[champ.cle] ?? ""));
        }
        if (JSON.stringify(actuelle) !== avant) {
          c.modifiees += 1;
          change = true;
        }
      }

      // Même raison que les sites : le PUT remplace tout le catalogue.
      if (change) {
        c.ecritures.push({
          url: `/api/konnect-examens?userProductId=${k.userProductId}`,
          methode: "PUT",
          corps: { examens: [...parCode.values()] },
        });
      }
      return c;
    },
  },

  {
    cle: "portail-regles",
    nom: "Portail règles",
    produit: "konnect",
    aide: "Les règles du portail, sous leur forme brute. Une case vide laisse la règle en place.",
    colonnes: ["Domaine", "Règle", "Réglage"],
    exporter: (pack) => {
      if (!pack.konnect) return null;
      return Object.values(DOMAINES_PRODUIT)
        .filter((d) => d.produit === "konnect" && d.cle !== "konnect.ris-identite")
        .map((d) => ({
          Domaine: d.cle,
          "Règle": d.libelle,
          "Réglage": JSON.stringify(pack.konnect!.domaines[d.cle] ?? {}),
        }));
    },
    importer: (lues, colonnes, pack) => {
      const k = pack.konnect;
      if (!k) return null;
      const c = constatVide();
      c.lues = lues.length;
      c.colonnesManquantes = ["Réglage"].filter((x) => !colonnes.includes(x));

      const connus = new Set(
        Object.values(DOMAINES_PRODUIT)
          .filter((d) => d.produit === "konnect" && d.cle !== "konnect.ris-identite")
          .map((d) => d.cle)
      );

      for (const ligne of lues) {
        const domaine = texteBrut(ligne.Domaine);
        if (domaine === "") continue;
        if (!connus.has(domaine)) {
          c.inconnues.push(domaine);
          continue;
        }
        const brut = texteBrut(ligne["Réglage"]);
        if (brut === "") continue;
        let valeur: unknown;
        try {
          valeur = JSON.parse(brut);
        } catch {
          c.remarques.push(`${domaine} : le réglage ne se lit pas, la règle en place est gardée.`);
          continue;
        }
        // La route exige un objet à la racine, et le dirait en 400. Le dire ici nomme
        // la ligne fautive, ce que la route ne peut pas faire.
        if (valeur === null || typeof valeur !== "object" || Array.isArray(valeur)) {
          c.remarques.push(`${domaine} : attendu un objet entre accolades.`);
          continue;
        }
        if (JSON.stringify(valeur) === JSON.stringify(k.domaines[domaine] ?? {})) continue;
        c.modifiees += 1;
        c.ecritures.push({
          url: `/api/product-config?userProductId=${k.userProductId}&domaine=${encodeURIComponent(domaine)}`,
          methode: "PUT",
          corps: { valeur },
        });
      }
      return c;
    },
  },
];
