import { enInternational } from "@/lib/ficheOuverture";
import { EXPEDITEUR_SMS_RE } from "@/lib/konnectConfig";

/**
 * La fiche d'ouverture d'un nouveau client LyraeKonnect, relue par l'assistant
 * `/admin/nouveau-centre-konnect` (plan `2026-10-onboarding-konnect-fiche-et-assistant.md`).
 *
 * La version simple de celle de Talk (`ficheOuverture.ts`), même mécanique : un HTML
 * autonome (`livrables/konnect/fiche-ouverture/`), réponses dans `<script id="reponses">`,
 * marquées `"produit": "konnect"` pour que chaque assistant reconnaisse la sienne.
 *
 * **Le fichier vient de l'extérieur : il est lu, jamais exécuté.** `DOMParser` construit un
 * document inerte, on n'en prend que le texte du bloc JSON, et chaque valeur est ramenée à
 * une chaîne avant usage. Seules les valeurs retenues passent par les routes existantes.
 */

export type SiteFicheKonnect = {
  nom: string;
  codeSite: string;
  adresse: string;
  cp: string;
  ville: string;
};

export type FicheKonnect = {
  centre: { nom: string };
  contact: { nom: string; fonction: string; mail: string; tel: string };
  informatique: { nom: string; mail: string };
  xplore: { version: string; acces: string };
  sites: SiteFicheKonnect[];
  portail: {
    telephone: string;
    examens: string[];
    envois: string[];
    expediteurSms: string;
    depassements: string;
    consignes: string;
  };
  web: { adresse: string; prestataire: string };
  comptes: { nom: string; mail: string; acces: string }[];
  remarques: string;
  rempliPar: string;
  rempliLe: string;
};

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

function versFiche(brut: Brut): FicheKonnect {
  const ct = objet(brut.contact);
  const inf = objet(brut.informatique);
  const x = objet(brut.xplore);
  const p = objet(brut.portail);
  const w = objet(brut.web);
  return {
    centre: { nom: texte(objet(brut.centre).nom) },
    contact: {
      nom: texte(ct.nom),
      fonction: texte(ct.fonction),
      mail: texte(ct.mail),
      tel: texte(ct.tel),
    },
    informatique: { nom: texte(inf.nom), mail: texte(inf.mail) },
    xplore: { version: texte(x.version), acces: texte(x.acces) },
    sites: liste(brut.sites)
      .map((s) => ({
        nom: texte(s.nom),
        codeSite: texte(s.codeSite).toUpperCase(),
        adresse: texte(s.adresse),
        cp: texte(s.cp),
        ville: texte(s.ville),
      }))
      .filter((s) => s.nom || s.codeSite || s.adresse),
    portail: {
      telephone: texte(p.telephone),
      examens: textes(p.examens),
      envois: textes(p.envois),
      expediteurSms: texte(p.expediteurSms),
      depassements: texte(p.depassements),
      consignes: texte(p.consignes),
    },
    web: { adresse: texte(w.adresse), prestataire: texte(w.prestataire) },
    comptes: liste(brut.comptes)
      .map((a) => ({
        nom: texte(a.nom),
        mail: texte(a.mail),
        acces: texte(a.acces),
      }))
      .filter((a) => a.nom || a.mail),
    remarques: texte(brut.remarques),
    rempliPar: texte(brut.rempliPar),
    rempliLe: texte(brut.rempliLe),
  };
}

/** Le produit que déclare une fiche : `konnect`, ou `talk` faute de marque (la fiche de Talk n'en porte pas). */
export function produitDeLaFiche(html: string): "talk" | "konnect" | null {
  const bloc = new DOMParser()
    .parseFromString(html, "text/html")
    .getElementById("reponses");
  if (!bloc) return null;
  try {
    return objet(JSON.parse(bloc.textContent || "{}")).produit === "konnect"
      ? "konnect"
      : "talk";
  } catch {
    return null;
  }
}

/**
 * Lit le HTML d'une fiche Konnect rendue. Lève une erreur au texte lisible si ce n'est pas
 * une fiche d'ouverture, si c'est celle de Talk, ou si elle est vide.
 */
export function lireFicheKonnect(html: string): FicheKonnect {
  const bloc = new DOMParser()
    .parseFromString(html, "text/html")
    .getElementById("reponses");
  if (!bloc) {
    throw new Error(
      "Ce fichier n'est pas une fiche d'ouverture : le bloc des réponses est introuvable.",
    );
  }
  let brut: Brut;
  try {
    brut = objet(JSON.parse(bloc.textContent || "{}"));
  } catch {
    throw new Error(
      "Les réponses de cette fiche sont illisibles. Demandez au client de l'enregistrer à nouveau.",
    );
  }
  if (brut.produit !== "konnect") {
    throw new Error(
      "C'est une fiche LyraeTalk. Déposez-la dans l'assistant « Nouveau centre ».",
    );
  }
  const fiche = versFiche(brut);
  if (!fiche.centre.nom && fiche.sites.length === 0) {
    throw new Error(
      "Cette fiche est vide : le client ne l'a pas remplie, ou c'est le modèle vierge.",
    );
  }
  return fiche;
}

/** Un identifiant de connexion lisible au téléphone, tiré du nom. */
export function identifiantDepuisNom(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Les réglages du portail que la fiche permet d'écrire, au format de
 * `PUT /api/konnect-configuration` (fusion sur l'existant : seules ces clés sont posées).
 * Une réponse absente ne pose rien, le défaut du portail reste.
 */
export function reglagesPortail(fiche: FicheKonnect): Record<string, unknown> {
  const p = fiche.portail;
  const r: Record<string, unknown> = {};
  if (p.telephone) r.telephoneSecretariat = enInternational(p.telephone);
  if (p.envois.length > 0) {
    r.envoiEmail = p.envois.includes("Mail");
    r.envoiSms = p.envois.includes("SMS");
  }
  // Un nom refusé par l'opérateur bloquerait tout l'enregistrement : on ne le reprend que valide.
  if (EXPEDITEUR_SMS_RE.test(p.expediteurSms))
    r.expediteurSms = p.expediteurSms;
  if (fiche.centre.nom) r.expediteurNomMail = fiche.centre.nom.slice(0, 60);
  if (p.depassements === "Oui") r.depassementHonoraires = true;
  if (p.depassements === "Non") r.depassementHonoraires = false;
  if (p.consignes) r.consignesGenerales = p.consignes;
  return r;
}

/** Les sites au format de `PUT /api/konnect-sites` (remplace l'ensemble). Sans code site, pas de site. */
export function sitesPortail(fiche: FicheKonnect) {
  return fiche.sites
    .filter((s) => s.codeSite)
    .map((s) => ({
      site_id: s.codeSite,
      libelle: s.nom || null,
      code_postal: /^\d{5}$/.test(s.cp) ? s.cp : "",
      adresse: [s.adresse, s.ville].filter(Boolean).join(", ") || null,
    }));
}
