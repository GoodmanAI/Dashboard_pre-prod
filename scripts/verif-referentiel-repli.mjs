/**
 * Vérification du repli des examens ajoutés au référentiel (`repliSur`, 02/11/2026).
 *
 *   node --experimental-strip-types scripts/verif-referentiel-repli.mjs
 *
 * Le dépôt n'a aucun runner de test. Ce script couvre `src/lib/referentielRepli.ts`,
 * module pur : aucune base, aucun réseau. Sort en code 1 si un cas échoue.
 */

import {
  completerAvecReferentiel,
  completerKonnectAvecReferentiel,
} from "../src/lib/referentielRepli.ts";

let echecs = 0;
function verifier(nom, obtenu, attendu) {
  const a = JSON.stringify(obtenu);
  const b = JSON.stringify(attendu);
  if (a === b) {
    console.log(`ok    ${nom}`);
  } else {
    echecs++;
    console.log(`ÉCHEC ${nom}\n      obtenu  ${a}\n      attendu ${b}`);
  }
}

const REFERENTIEL = [
  { codeExamen: "N01MR043", typeExamen: "MR", libelle: "IRM du rachis dorsal" },
  {
    codeExamen: "N01MR044",
    typeExamen: "MR",
    libelle: "IRM du rachis lombaire",
  },
  {
    codeExamen: "N01MR141",
    typeExamen: "MR",
    libelle: "IRM du rachis dorso-lombaire",
    repliSur: ["N01MR044", "N01MR043"],
  },
];

function ligneTalk(code, extra = {}) {
  return {
    typeExamen: "MR",
    codeExamen: code,
    libelle: code,
    Synonymes: [],
    Interrogatoire: [],
    Commentaire: "",
    performed: true,
    typeExamenClient: "",
    libelleClient: "",
    codeExamenClient: "",
    horaireMapping: null,
    codeExamenClientInject: null,
    postes: [],
    ...extra,
  };
}

const heritage = (l) => ({
  performed: l.performed,
  codeExamenClient: l.codeExamenClient,
  codeExamenClientInject: l.codeExamenClientInject,
  typeExamenClient: l.typeExamenClient,
  postes: l.postes,
  Interrogatoire: l.Interrogatoire,
  libelleClient: l.libelleClient,
  repliSur: l.repliSur,
});

// 1. Le parent lombaire a un code RIS : la nouvelle ligne en hérite, non pratiquée.
{
  const m = {
    N01MR043: ligneTalk("N01MR043", { codeExamenClient: "IRMDOR" }),
    N01MR044: ligneTalk("N01MR044", {
      codeExamenClient: "IRMLOMB",
      codeExamenClientInject: "IRMLOMB+",
      typeExamenClient: "IRM",
      postes: ["IRM1"],
      Interrogatoire: ["Avez-vous un pacemaker ?"],
      libelleClient: "IRM lombaire (centre)",
    }),
  };
  completerAvecReferentiel(m, REFERENTIEL, { centreDejaConfigure: true });
  verifier("Talk : hérite du lombaire", heritage(m.N01MR141), {
    performed: false,
    codeExamenClient: "IRMLOMB",
    codeExamenClientInject: "IRMLOMB+",
    typeExamenClient: "IRM",
    postes: ["IRM1"],
    Interrogatoire: ["Avez-vous un pacemaker ?"],
    libelleClient: "",
    repliSur: ["N01MR044", "N01MR043"],
  });
  verifier("Talk : repliSur vide sur un parent", m.N01MR044.repliSur, []);
  verifier(
    "Talk : le parent n'est pas modifié",
    m.N01MR044.codeExamenClient,
    "IRMLOMB",
  );
}

// 2. Lombaire sans code RIS : repli sur le dorsal.
{
  const m = {
    N01MR043: ligneTalk("N01MR043", {
      codeExamenClient: "IRMDOR",
      postes: ["IRM2"],
    }),
    N01MR044: ligneTalk("N01MR044", {
      codeExamenClient: "  ",
      performed: false,
    }),
  };
  completerAvecReferentiel(m, REFERENTIEL, { centreDejaConfigure: true });
  verifier(
    "Talk : repli sur le dorsal",
    [m.N01MR141.codeExamenClient, m.N01MR141.postes],
    ["IRMDOR", ["IRM2"]],
  );
}

// 3. Centre vierge : ligne ajoutée pratiquée par défaut, aucun parent avec code.
{
  const m = {};
  completerAvecReferentiel(m, REFERENTIEL, { centreDejaConfigure: false });
  verifier("Talk : centre vierge", heritage(m.N01MR141), {
    performed: true,
    codeExamenClient: "",
    codeExamenClientInject: null,
    typeExamenClient: "",
    postes: [],
    Interrogatoire: [],
    libelleClient: "",
    repliSur: ["N01MR044", "N01MR043"],
  });
}

// 4. Ligne déjà paramétrée (code RIS propre) : rien n'est hérité.
{
  const m = {
    N01MR044: ligneTalk("N01MR044", { codeExamenClient: "IRMLOMB" }),
    N01MR141: ligneTalk("N01MR141", {
      codeExamenClient: "IRMDL",
      performed: true,
    }),
  };
  completerAvecReferentiel(m, REFERENTIEL, { centreDejaConfigure: true });
  verifier(
    "Talk : ligne paramétrée intacte",
    [m.N01MR141.codeExamenClient, m.N01MR141.performed, m.N01MR141.repliSur],
    ["IRMDL", true, ["N01MR044", "N01MR043"]],
  );
}

// 4 bis. Ligne enregistrée non pratiquée sans code RIS (écrite par l'écran Questions) :
// elle continue de suivre son parent, ses questions propres gardées.
{
  const m = {
    N01MR044: ligneTalk("N01MR044", {
      codeExamenClient: "IRMLOMB",
      Interrogatoire: ["Question du parent"],
    }),
    N01MR141: ligneTalk("N01MR141", {
      performed: false,
      Interrogatoire: ["Question propre"],
    }),
  };
  completerAvecReferentiel(m, REFERENTIEL, { centreDejaConfigure: true });
  verifier(
    "Talk : enregistrée non paramétrée suit le parent",
    [m.N01MR141.codeExamenClient, m.N01MR141.Interrogatoire],
    ["IRMLOMB", ["Question propre"]],
  );
}

// 5. Aucun parent chez le centre : ligne ajoutée sans code.
{
  const m = { N01MR001: ligneTalk("N01MR001", { codeExamenClient: "X" }) };
  completerAvecReferentiel(m, REFERENTIEL, { centreDejaConfigure: true });
  verifier(
    "Talk : aucun parent",
    [m.N01MR141.codeExamenClient, m.N01MR141.performed],
    ["", false],
  );
  verifier("Talk : repliSur vide hors référentiel", m.N01MR001.repliSur, []);
}

// --- Konnect ---
function ligneKonnect(code, extra = {}) {
  return {
    codeExamen: code,
    typeExamen: "MR",
    libelle: code,
    codeExamenClient: "",
    codeExamenInjection: "",
    typeExamenClient: "",
    libelleClient: "",
    performed: true,
    reservableEnLigne: true,
    ordoOblig: false,
    examenInjecte: false,
    postes: [],
    fileAttente: false,
    ...extra,
  };
}

{
  const sortie = completerKonnectAvecReferentiel(
    [
      ligneKonnect("N01MR043", { codeExamenClient: "IRMDOR" }),
      ligneKonnect("N01MR044", {
        codeExamenClient: "IRMLOMB",
        codeExamenInjection: "IRMLOMB+",
        postes: ["IRM1"],
        reservableEnLigne: false,
        ordoOblig: true,
        examenInjecte: true,
        fileAttente: true,
      }),
    ],
    REFERENTIEL,
  );
  const n = sortie.find((l) => l.codeExamen === "N01MR141");
  verifier("Konnect : ligne ajoutée héritée", n, {
    codeExamen: "N01MR141",
    typeExamen: "MR",
    libelle: "IRM du rachis dorso-lombaire",
    codeExamenClient: "IRMLOMB",
    codeExamenInjection: "IRMLOMB+",
    typeExamenClient: "",
    libelleClient: "",
    performed: false,
    reservableEnLigne: false,
    ordoOblig: true,
    examenInjecte: false,
    postes: ["IRM1"],
    fileAttente: false,
    repliSur: ["N01MR044", "N01MR043"],
  });
  verifier(
    "Konnect : 3 lignes, enregistrées d'abord",
    sortie.map((l) => l.codeExamen),
    ["N01MR043", "N01MR044", "N01MR141"],
  );
}

{
  const sortie = completerKonnectAvecReferentiel(
    [ligneKonnect("N01MR141", { codeExamenClient: "IRMDL", performed: true })],
    REFERENTIEL,
  );
  const n = sortie.find((l) => l.codeExamen === "N01MR141");
  verifier(
    "Konnect : ligne enregistrée intacte",
    [n.codeExamenClient, n.performed],
    ["IRMDL", true],
  );
}

console.log(
  echecs === 0 ? "\nTous les cas passent." : `\n${echecs} cas en échec.`,
);
process.exit(echecs === 0 ? 0 : 1);
