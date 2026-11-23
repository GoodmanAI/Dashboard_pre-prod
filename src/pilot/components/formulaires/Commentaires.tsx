"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent as EvenementSouris } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Box, Button, Chip, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { IconMessages } from "@tabler/icons-react";
import { Bloc, Ligne } from "@/pilot/components/Bloc";
import { DialogueFormulaire, envoyer } from "./DialogueFormulaire";
import type { Moi } from "./Demandes";
import type { CommentairesNonLus, LigneCommentaire, PageFil } from "@/pilot/lib/commentaires/charger";
import { compteurSaisie, dateHeure, extrait, garderPagesChargees, phraseFil } from "@/pilot/lib/commentaires/affichage";
import { noterCommentaireLu, signalerPourVous } from "@/pilot/components/pourVous";
import {
  GENRES_PREVENIR, aideGenre, libelleOptionDepartement, libelleOptionPersonne, libelleOptionTous, raisonGenreImpossible,
  type Cibles, type ChoixPrevenir,
} from "@/pilot/lib/commentaires/cibles";
import { LIBELLES_DEPARTEMENT } from "@/pilot/lib/acces/departements";
import { messageCommentaire, nouveauCommentaire } from "@/pilot/lib/validation/commentaire";
import { JETONS } from "@/pilot/jetons";
import type { CrmDepartement } from "@prisma/client";

/**
 * Les commentaires d'un client, avec ou sans alerte (lot T). Le texte saisi
 * part dans le corps d'une requête, jamais dans l'adresse. Un commentaire qui
 * vous prévient se marque lu quand il reste à l'écran (voir `LigneFil`).
 */
export type { PageFil };
/** `commentaire` est null si le commentaire a été supprimé entre son écriture et sa relecture. */
type Ecriture = { commentaire: LigneCommentaire | null; destinataires: number };

/** Les mots qui coupent partout : un mot sans espace, une adresse, ne fait jamais défiler la page de côté. */
const REPLI = { overflowWrap: "anywhere", wordBreak: "break-word", minWidth: 0 } as const;
/**
 * Le texte d'un commentaire, ou son extrait : sa direction vient de son premier
 * signe fort, et il est isolé de ce qui l'entoure. Un texte en arabe ou en
 * hébreu ne retourne ni le nom de l'auteur ni la date à côté.
 */
const TEXTE_ISOLE = { unicodeBidi: "isolate" } as const;

const marquerLu = (id: number) => envoyer(`/api/pilot/commentaires/${id}/lu`, "POST");

export function BlocCommentaires({ organisationId, fil, cibles, moi }: { organisationId: number; fil: PageFil; cibles: Cibles; moi: Moi }) {
  // Ce qui est affiché : la première page du serveur, ce qu'on y ajoute en écrivant, les pages plus anciennes chargées.
  // Lire ou supprimer ne relit pas la page : l'état local suffit, et la pastille du menu se relit seule (`signalerPourVous`).
  // Une relecture venue d'ailleurs (une autre action de la fiche) remplace la première page et garde les plus anciennes déjà chargées.
  const [source, setSource] = useState(fil);
  const [lignes, setLignes] = useState(fil.commentaires);
  const [total, setTotal] = useState(fil.total);
  const [curseur, setCurseur] = useState(fil.curseur);
  if (source !== fil) {
    const garde = garderPagesChargees({ lignes, curseur }, fil);
    setSource(fil); setLignes(garde.lignes); setTotal(fil.total); setCurseur(garde.curseur);
  }
  const [aSupprimer, setASupprimer] = useState<LigneCommentaire | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreurSuite, setErreurSuite] = useState<string | null>(null);

  async function chargerSuite() {
    if (!curseur || chargement) return;
    setChargement(true); setErreurSuite(null);
    try {
      const page = await envoyer<PageFil>(`/api/pilot/organisations/${organisationId}/commentaires?avant=${encodeURIComponent(curseur)}`, "GET");
      setLignes((avant) => [...avant, ...page.commentaires.filter((c) => !avant.some((a) => a.id === c.id))]);
      setCurseur(page.curseur); setTotal(page.total);
    } catch (e) { setErreurSuite(e instanceof Error ? e.message : "Les commentaires n'ont pas pu être chargés."); }
    finally { setChargement(false); }
  }

  return <Bloc icone={IconMessages} teinte="bleu" titre="Commentaires" nombre={total} id="commentaires" sx={{ scrollMarginTop: 72 }}>
    <ZoneEcriture organisationId={organisationId} cibles={cibles}
      ajoute={(c) => { setLignes((avant) => [c, ...avant.filter((a) => a.id !== c.id)]); setTotal((n) => n + 1); }} />
    {lignes.length === 0
      ? <Typography variant="body2" color="text.secondary" sx={{ px: 2.75, pt: 0.5, pb: 2.75 }}>
        Notez ici ce que l&apos;équipe doit savoir sur ce client. Vous pouvez prévenir un collègue ou un département.
      </Typography>
      : <Box component="ul" aria-label="Fil des commentaires" sx={{ listStyle: "none", m: 0, p: 0 }}>
        {lignes.map((c) => <LigneFil key={c.id} commentaire={c} moi={moi} supprimer={() => setASupprimer(c)}
          lu={() => { setLignes((avant) => avant.map((a) => a.id === c.id ? { ...a, lu: true } : a)); noterCommentaireLu(c.id); }} />)}
      </Box>}
    {(curseur || erreurSuite) && <Box sx={{ px: 2.75, pb: 2.25, pt: 1 }}>
      {erreurSuite && <Typography variant="body2" color="error" role="alert" sx={{ mb: 1 }}>{erreurSuite}</Typography>}
      {curseur && <Button variant="outlined" onClick={() => void chargerSuite()} disabled={chargement}>Voir les commentaires plus anciens</Button>}
    </Box>}
    {aSupprimer && <DialogueFormulaire titre="Supprimer ce commentaire ?" bouton="Supprimer" suppression fermer={() => setASupprimer(null)} soumettre={async () => {
      await envoyer(`/api/pilot/commentaires/${aSupprimer.id}`, "DELETE");
      setLignes((avant) => avant.filter((a) => a.id !== aSupprimer.id)); setTotal((n) => Math.max(0, n - 1));
      setASupprimer(null); signalerPourVous();
    }}>
      <Typography>Le texte disparaît pour tout le monde, y compris pour les personnes prévenues. Il ne pourra pas être récupéré.</Typography>
      <Typography color="text.secondary" dir="auto" sx={{ ...REPLI, ...TEXTE_ISOLE }}>{extrait(aSupprimer.texte, 120)}</Typography>
    </DialogueFormulaire>}
  </Bloc>;
}

/** La zone d'écriture : le texte, qui prévenir, et le bouton. Le seul bouton plein de la fiche est « Noter un échange » : celui-ci reste contour. */
function ZoneEcriture({ organisationId, cibles, ajoute }: { organisationId: number; cibles: Cibles; ajoute: (c: LigneCommentaire) => void }) {
  const [texte, setTexte] = useState("");
  const [genre, setGenre] = useState<ChoixPrevenir>("AUCUN");
  const [departement, setDepartement] = useState<CrmDepartement | "">("");
  const [personneId, setPersonneId] = useState<number | "">("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const verrou = useRef(false);
  const compteur = compteurSaisie(texte);

  async function soumettre() {
    if (verrou.current) return;
    setErreur(null); setConfirmation(null);
    const corps = { texte, cible: genre, ...(genre === "DEPARTEMENT" && departement ? { departement } : {}), ...(genre === "PERSONNE" && personneId ? { personneId } : {}) };
    // La même validation que le serveur, pour dire le refus sans attendre. Le corps envoyé reste le brut : le serveur retransforme.
    const analyse = nouveauCommentaire.safeParse(corps);
    if (!analyse.success) { setErreur(messageCommentaire(analyse.error)); return; }
    verrou.current = true; setEnvoi(true);
    try {
      const { commentaire, destinataires } = await envoyer<Ecriture>(`/api/pilot/organisations/${organisationId}/commentaires`, "POST", undefined, corps);
      // Enregistré puis aussitôt supprimé (par un super-administrateur, dans un autre onglet) : rien à ajouter au fil.
      if (commentaire) ajoute(commentaire);
      setTexte(""); setGenre("AUCUN"); setDepartement(""); setPersonneId("");
      setConfirmation(!commentaire ? "Commentaire enregistré, puis supprimé entre-temps."
        : destinataires > 0 ? `Commentaire ajouté. ${destinataires > 1 ? `${destinataires} personnes prévenues` : "1 personne prévenue"}.` : "Commentaire ajouté.");
      signalerPourVous();
    } catch (e) { setErreur(e instanceof Error ? e.message : "Le commentaire n'a pas été enregistré. Réessayez."); }
    finally { verrou.current = false; setEnvoi(false); }
  }
  const surTouche = (e: KeyboardEvent) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void soumettre(); } };
  const couleurCompteur = compteur.niveau === "depasse" ? "error.main" : compteur.niveau === "proche" ? "warning.dark" : "text.secondary";

  return <Box component="form" noValidate onSubmit={(e) => { e.preventDefault(); void soumettre(); }} onKeyDown={surTouche} aria-label="Écrire un commentaire" sx={{ px: 2.75, pb: 2.25 }}>
    <Stack spacing={1.5}>
      <TextField label="Votre commentaire" multiline minRows={3} maxRows={10} fullWidth value={texte} error={compteur.niveau === "depasse"}
        onChange={(e) => { setTexte(e.target.value); setErreur(null); setConfirmation(null); }}
        InputLabelProps={{ shrink: true }} placeholder="Ce que l'équipe doit savoir sur ce client."
        helperText={<Box component="span" sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
          <span>Jamais de donnée patient.</span>
          <Box component="span" sx={{ color: couleurCompteur, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{compteur.libelle}</Box>
        </Box>} />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "flex-start" }}>
        <TextField select label="Prévenir" value={genre} sx={{ flex: { sm: "1 1 0" }, minWidth: 0 }} fullWidth helperText={aideGenre(genre)}
          onChange={(e) => { setGenre(e.target.value as ChoixPrevenir); setErreur(null); }}
          SelectProps={{ renderValue: (v) => GENRES_PREVENIR.find((g) => g.valeur === v)?.libelle ?? "" }}>
          {GENRES_PREVENIR.map((g) => {
            const raison = raisonGenreImpossible(g.valeur, cibles);
            return <MenuItem key={g.valeur} value={g.valeur} disabled={raison !== null} sx={{ whiteSpace: "normal", ...REPLI }}>
              <Box>{g.libelle}{raison && <Typography variant="caption" component="div" color="text.secondary">{raison}</Typography>}
                {g.valeur === "TOUS" && !raison && <Typography variant="caption" component="div" color="text.secondary">{libelleOptionTous(cibles.tous)}</Typography>}</Box>
            </MenuItem>;
          })}
        </TextField>
        {genre === "DEPARTEMENT" && <TextField select label="Département" value={departement} sx={{ flex: { sm: "1 1 0" }, minWidth: 0 }} fullWidth
          onChange={(e) => { setDepartement(e.target.value as CrmDepartement); setErreur(null); }}
          SelectProps={{ displayEmpty: true, renderValue: (v) => v ? LIBELLES_DEPARTEMENT[v as CrmDepartement] : <Box component="span" sx={{ color: "text.secondary" }}>Choisir un département</Box> }}>
          {cibles.departements.map((d) => <MenuItem key={d.departement} value={d.departement} disabled={d.nombre === 0} sx={{ whiteSpace: "normal", ...REPLI }}>
            {libelleOptionDepartement(d)}
          </MenuItem>)}
        </TextField>}
        {genre === "PERSONNE" && <TextField select label="Personne" value={personneId} sx={{ flex: { sm: "1 1 0" }, minWidth: 0 }} fullWidth
          onChange={(e) => { setPersonneId(Number(e.target.value)); setErreur(null); }}
          SelectProps={{ displayEmpty: true, renderValue: (v) => cibles.personnes.find((p) => p.id === v)?.nom ?? <Box component="span" sx={{ color: "text.secondary" }}>Choisir une personne</Box> }}>
          {cibles.personnes.map((p) => <MenuItem key={p.id} value={p.id} sx={{ whiteSpace: "normal", ...REPLI }}>{libelleOptionPersonne(p)}</MenuItem>)}
        </TextField>}
      </Stack>
      {erreur && <Typography variant="body2" color="error" role="alert" sx={REPLI}>{erreur}</Typography>}
      {confirmation && <Typography variant="body2" color="text.secondary" role="status" sx={REPLI}>{confirmation}</Typography>}
      <Box><Button type="submit" variant="outlined" disabled={envoi}>Ajouter le commentaire</Button></Box>
    </Stack>
  </Box>;
}

/**
 * Un commentaire du fil. S'il vous prévient et que vous ne l'avez pas lu, il se
 * marque lu quand il reste à l'écran 800 ms (la fiche ouverte, l'onglet visible).
 * Le mot « Nouveau » reste jusqu'au rechargement : on voit ce qui vient d'être lu.
 * Si le marquage échoue, un bouton le propose.
 */
function LigneFil({ commentaire: c, moi, supprimer, lu }: { commentaire: LigneCommentaire; moi: Moi; supprimer: () => void; lu: () => void }) {
  const [nouveau] = useState(c.lu === false);
  const [etat, setEtat] = useState<"attente" | "envoi" | "fait" | "echec">(c.lu === false ? "attente" : "fait");
  const racine = useRef<HTMLLIElement>(null);
  const luRef = useRef(lu);
  luRef.current = lu;

  async function marquer() {
    setEtat("envoi");
    try { await marquerLu(c.id); setEtat("fait"); luRef.current(); }
    catch { setEtat("echec"); }
  }

  useEffect(() => {
    if (etat !== "attente") return;
    const element = racine.current;
    if (!element) return;
    let enVue = false;
    let minuteur: ReturnType<typeof setTimeout> | null = null;
    const desarmer = () => { if (minuteur) { clearTimeout(minuteur); minuteur = null; } };
    const armer = () => {
      if (minuteur || !enVue || document.visibilityState !== "visible") return;
      minuteur = setTimeout(() => { minuteur = null; void marquer(); }, 800);
    };
    const surVisibilite = () => { if (document.visibilityState === "visible") armer(); else desarmer(); };
    if (typeof IntersectionObserver === "undefined") { void marquer(); return; }
    // Une bande centrale de l'écran : un long commentaire, plus haut que l'écran, compte dès qu'il y entre.
    const observateur = new IntersectionObserver(([entree]) => { enVue = entree?.isIntersecting ?? false; if (enVue) armer(); else desarmer(); },
      { rootMargin: "-10% 0px -10% 0px", threshold: 0 });
    observateur.observe(element);
    document.addEventListener("visibilitychange", surVisibilite);
    return () => { observateur.disconnect(); document.removeEventListener("visibilitychange", surVisibilite); desarmer(); };
    // `marquer` ne change que par l'identifiant du commentaire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etat, c.id]);

  return <Box component="li" ref={racine} data-commentaire={c.id} data-lu={c.lu === null ? undefined : String(c.lu)} sx={{ position: "relative", px: 2.75, py: 1.75,
    "&::before": { content: '""', position: "absolute", top: 0, left: 22, right: 0, borderTop: `1px solid ${JETONS.filetInterne}` } }}>
    <Stack direction="row" flexWrap="wrap" useFlexGap columnGap={1.25} rowGap={0.25} alignItems="baseline">
      <Typography component="span" fontWeight={600} sx={REPLI}>{c.auteur}</Typography>
      <Typography component="span" variant="body2" color="text.secondary">{dateHeure(c.creeLe)}</Typography>
      {nouveau && <Chip label="Nouveau" color="primary" />}
      {c.peutSupprimer && <Button size="small" onClick={supprimer} sx={{ ml: "auto" }} aria-label={`Supprimer le commentaire de ${c.auteur}`}>Supprimer</Button>}
    </Stack>
    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, ...REPLI }}>{phraseFil(c, moi.id)}</Typography>
    <Typography dir="auto" sx={{ mt: 0.75, whiteSpace: "pre-wrap", ...REPLI, ...TEXTE_ISOLE }}>{c.texte}</Typography>
    {etat === "echec" && <Stack direction="row" flexWrap="wrap" useFlexGap gap={1} alignItems="center" sx={{ mt: 1 }}>
      <Typography variant="body2" color="text.secondary">Ce commentaire n&apos;a pas pu être marqué comme lu.</Typography>
      <Button size="small" onClick={() => void marquer()}>Marquer comme lu</Button>
    </Stack>}
  </Box>;
}

/**
 * Un commentaire non lu dans « Pour vous » d'Aujourd'hui : le client, l'auteur,
 * un extrait court et le lien. Ouvrir le marque lu : le clic envoie le
 * marquage (une seconde au plus), puis ouvre la fiche. Le marquage réussi
 * prévient la pastille du menu et retient qu'Aujourd'hui est à relire
 * (`noterCommentaireLu`) : au retour, la page se relit au lieu de rendre la
 * copie gardée par le routeur. Un clic avec Ctrl, Cmd ou Maj, ou un clic du
 * milieu, laisse le navigateur faire : la fiche marque alors lu ce qu'elle montre.
 */
export function LigneCommentaireDuJour({ commentaire: c }: { commentaire: CommentairesNonLus["commentaires"][number] }) {
  const router = useRouter();
  const href = `/pilot/organisations/${c.organisationId}#commentaires`;
  async function ouvrir(e: EvenementSouris<HTMLAnchorElement>) {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const marquage = marquerLu(c.id).then(() => noterCommentaireLu(c.id), () => undefined);
    await Promise.race([marquage, new Promise((resolve) => setTimeout(resolve, 1000))]);
    router.push(href);
  }
  return <Ligne data-commentaire={c.id}
    nom={<>Commentaire de {c.auteur}</>}
    detail={<>
      <Box sx={REPLI}><Link href={`/pilot/organisations/${c.organisationId}`} onClick={ouvrir}>{c.organisationNom}</Link></Box>
      <Box dir="auto" sx={{ color: "text.primary", mt: 0.5, ...REPLI, ...TEXTE_ISOLE }}>{extrait(c.texte)}</Box>
    </>}
    date={dateHeure(c.creeLe)}>
    <Button component={Link} href={href} onClick={ouvrir} variant="outlined">Ouvrir</Button>
  </Ligne>;
}
