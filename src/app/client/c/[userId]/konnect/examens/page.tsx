"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useSession } from "next-auth/react";
import { useCentreProduit } from "@/hooks/useCentreProduit";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import ExamTypeBadge, { EXAM_TYPE_SHORT } from "@/components/shared/ExamTypeBadge";
import BarreEnregistrement from "@/components/shared/BarreEnregistrement";
import { useSuiviModifications } from "@/hooks/useSuiviModifications";
import {
  CarteMapping,
  CaseMapping,
  CelluleCodeLibelle,
  CelluleExamen,
  CelluleInjection,
  CelluleType,
  EnTeteMapping,
  RangeeChamp,
  SEUIL_FICHES,
} from "@/components/mapping/cellules";
import ImportExportMapping, {
  CHAMPS_KONNECT,
} from "@/components/mapping/ImportExportMapping";

/**
 * Mapping d'examens LyraeKonnect d'un centre.
 *
 * Reprend la direction artistique de l'écran équivalent de LyraeTalk
 * (`talk/[id]/parametrage/mapping_exam`) : mêmes constantes de couleur, même badge
 * de modalité, même densité de table. Un client qui a les deux produits retrouve
 * le même écran ; seules changent les colonnes de droite.
 *
 * Le référentiel NEURACORP est pré-rempli à gauche, le client renseigne les
 * équivalents de son RIS à droite. Quand il a déjà LyraeTalk, les codes en sont
 * repris : même logiciel de gestion, donc mêmes codes.
 *
 * LES DEUX ÉCRANS ONT CONVERGÉ LE 14/09/2026, à la demande du client. Ce qui est
 * commun vit dans `components/mapping/cellules.tsx` et se présente identiquement des
 * deux côtés, dans cet ordre : la case « pratiqué » ouvre la ligne, la ligne
 * s'estompe quand elle est décochée, puis l'examen de notre référentiel, puis le code
 * du RIS et le libellé patient **l'un au-dessus de l'autre** (c'était la disposition
 * de LyraeTalk), puis le type, puis « injecté » et son code.
 *
 * ⚠️ Seules les CELLULES sont partagées, jamais la ligne. Une ligne générique aurait
 * dû connaître les colonnes des deux produits, donc leurs invariants : c'est
 * exactement ce qui a cassé le 14/09/2026, le composant d'import partagé appliquant à
 * LyraeTalk une règle propre à Konnect.
 *
 * Deux réglages restent propres à ce produit, parce qu'ils pilotent des écrans du
 * parcours web que le robot vocal n'a pas :
 *
 * - Réservable en ligne : le patient choisit son créneau seul, ou on le rappelle ;
 * - Ordonnance obligatoire : le portail demande le dépôt de l'ordonnance et signale
 *   le dossier au secrétariat tant qu'elle n'est pas validée. Il ne bloque pas la
 *   réservation (règle `_ordonnance_obligatoire_non_validee` de Konnect, criticité
 *   haute, `INFORMER` + `MARQUER_VALIDATION`).
 *
 * ⚠️ « LISTE D'ATTENTE » N'A PLUS DE COLONNE (14/09/2026), et sa valeur est
 * néanmoins chargée, gardée dans l'état et renvoyée par le `PUT`. Sans cela, retirer
 * la colonne l'aurait remise à `false` chez tous les centres, en silence : le `PUT`
 * remplace la ligne entière, et `normaliser` lit `listeAttenteActive === true`. La
 * règle « un champ absent d'un PUT doit être préservé » s'applique aussi quand c'est
 * l'écran qui cesse de l'afficher.
 *
 * Depuis le chantier `2026-09-konnect-deux-chemins`, cet écran est le SEUL endroit
 * où se décide le chemin d'une demande. L'écran « Modes de traitement », ses trois
 * modes et son réglage par famille ont disparu : deux cases suffisent, et elles ne
 * disent pas la même chose.
 *
 * - « Pratiqué » : le centre fait cet examen, le portail le reconnaît. Décoché, le
 *   patient qui le demande voit le numéro du centre.
 * - « Réservable en ligne » : parmi ceux-là, ceux que le patient réserve seul.
 *   Décoché, aucun créneau ne lui est proposé et on lui offre d'être rappelé.
 */

const BRAND = "var(--accent)";
const BRAND_DARK = "var(--accent-press)";
const INK = "#0F2A3F";
const INK_MUTED = "#5A6B7B";
const BORDER = "#E4EAEE";
const SURFACE = "#FFFFFF";
const SURFACE_MUTED = "#F7FAFB";
const SURFACE_HOVER = "#F5FBFA";

const PAR_PAGE = 25;

type Ligne = {
  codeExamen: string;
  typeExamen: string | null;
  libelle: string | null;
  codeExamenClient: string;
  codeExamenInjection: string;
  typeExamenClient: string;
  libelleClient: string;
  performed: boolean;
  reservableEnLigne: boolean;
  ordoOblig: boolean;
  examenInjecte: boolean;
  listeAttenteActive: boolean;
};

type FiltreAttribution = "tous" | "attribues" | "non_attribues";
type FiltreChemin = "tous" | "bout_en_bout" | "rappel";

export default function MappingExamensKonnect() {
  const { userProductId } = useCentreProduit();

  /**
   * En dessous du seuil, chaque examen devient une fiche : tous ses champs visibles
   * d'un coup, au lieu d'un tableau qu'il faudrait pousser vers la gauche pour
   * atteindre la colonne qu'on remplit. Même seuil que LyraeTalk, voir
   * `SEUIL_FICHES`.
   */
  const theme = useTheme();
  const enFiches = useMediaQuery(theme.breakpoints.down(SEUIL_FICHES));

  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [initial, setInitial] = useState<Ligne[]>([]);
  /**
   * Le tableau affiché vient d'une amorce (mapping LyraeTalk ou référentiel) et
   * n'est donc PAS enregistré. Tout y est à sauver, même sans y toucher : sans ce
   * drapeau, le compteur de modifications vaudrait zéro et le bouton resterait
   * éteint sur un tableau que le client doit justement valider.
   */
  const [amorce, setAmorce] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);
  const [avertissement, setAvertissement] = useState<string | null>(null);
  // Ecarts constates par le portail entre ce qui est saisi ici et ce que le
  // logiciel du centre declare (lot I). Purement informatif : on ne corrige rien,
  // la saisie du client fait autorite. `null` = aucun rapprochement recu.
  // LE RAPPROCHEMENT EST UN OUTIL D'INSTALLATION, PAS UN REPROCHE AU CLIENT.
  // Un centre qui ouvre son ecran de mapping n'a pas a decouvrir 69 codes en
  // rouge sur un travail qu'on fait avec lui. Le calcul reste le meme pour tous,
  // seul l'affichage est reserve : c'est nous qui traitons ces ecarts.
  const { data: session } = useSession();
  const estAdmin =
    session?.user?.role === "ADMIN" || session?.user?.role === "SUPER_ADMIN";

  const [ecarts, setEcarts] = useState<{
    nb_codes_inconnus: number;
    nb_types_incoherents: number;
    nb_absents_du_mapping: number;
    codes_inconnus: string[];
    types_incoherents: { code: string; saisi: string; attendu: string }[];
    absents_du_mapping: string[];
  } | null>(null);

  const [recherche, setRecherche] = useState("");
  const [filtreType, setFiltreType] = useState("tous");
  const [filtreAttribution, setFiltreAttribution] = useState<FiltreAttribution>("tous");
  const [filtreChemin, setFiltreChemin] = useState<FiltreChemin>("tous");
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!userProductId) return;
    let annule = false;
    (async () => {
      try {
        const r = await fetch(`/api/konnect-examens?userProductId=${userProductId}`);
        if (!r.ok) throw new Error("Chargement impossible.");
        const data = await r.json();
        if (annule) return;
        const chargees: Ligne[] = Array.isArray(data.examens) ? data.examens : [];
        setLignes(chargees);
        setInitial(chargees);
        setAmorce(data.amorce === true);
        // Seul le cas « rien à proposer » mérite un message : d'où viennent les
        // lignes n'intéresse pas le client, il veut juste remplir son tableau.
        if (data.source === "indisponible") {
          setAvertissement(
            data.motif ??
              "Le référentiel d'examens n'a pas pu être chargé. Contactez l'équipe technique."
          );
        }

        // Separe et volontairement silencieux : le rapprochement enrichit l'ecran,
        // il ne le conditionne pas. Un portail qui n'a rien remonte ne doit pas
        // empecher de saisir son mapping.
        try {
          const rEtat = await fetch(`/api/konnect-remontee?userProductId=${userProductId}`);
          if (rEtat.ok) {
            const dEtat = await rEtat.json();
            const c = dEtat?.charge?.catalogue;
            if (c && typeof c === "object") setEcarts(c);
          }
        } catch {
          // On reste sans rapprochement, ce qui est l'etat par defaut.
        }
      } catch {
        if (!annule) setErreur("Impossible de charger le mapping.");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [userProductId]);

  function maj(codeExamen: string, champ: keyof Ligne, valeur: any) {
    setLignes((prev) =>
      prev.map((l) => (l.codeExamen === codeExamen ? { ...l, [champ]: valeur } : l))
    );
  }

  const types = useMemo(() => {
    const set = new Set<string>();
    lignes.forEach((l) => l.typeExamen && set.add(l.typeExamen));
    return Array.from(set).sort();
  }, [lignes]);

  /**
   * Les types que CE client a déjà saisis, proposés dans la colonne « Type ».
   *
   * Distincts des `types` ci-dessus, qui sont ceux de notre référentiel et servent
   * au filtre. Un centre emploie trois ou quatre codes de type pour ses 287
   * examens : les proposer évite la faute de frappe qui casse le couple
   * (type, code) attendu par le RIS sans lever la moindre erreur.
   */
  const typesClient = useMemo(() => {
    const set = new Set<string>();
    lignes.forEach((l) => {
      const t = l.typeExamenClient.trim();
      if (t) set.add(t);
    });
    return Array.from(set).sort();
  }, [lignes]);

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return lignes.filter((l) => {
      if (filtreType !== "tous" && l.typeExamen !== filtreType) return false;
      const attribue = Boolean(l.codeExamenClient.trim());
      if (filtreAttribution === "attribues" && !attribue) return false;
      if (filtreAttribution === "non_attribues" && attribue) return false;
      if (filtreChemin === "bout_en_bout" && !l.reservableEnLigne) return false;
      if (filtreChemin === "rappel" && l.reservableEnLigne) return false;
      if (!q) return true;
      return [l.codeExamen, l.libelle, l.codeExamenClient, l.libelleClient]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [lignes, recherche, filtreType, filtreAttribution, filtreChemin]);

  const attribues = useMemo(
    () => lignes.filter((l) => l.performed && l.codeExamenClient.trim()).length,
    [lignes]
  );

  /** Parmi les examens proposés, ceux qui passent par un rappel du centre. */
  const surRappel = useMemo(
    () =>
      lignes.filter((l) => l.performed && l.codeExamenClient.trim() && !l.reservableEnLigne)
        .length,
    [lignes]
  );

  /**
   * Deux lignes qui visent le même code : le portail ne saurait pas laquelle
   * réserver. Marqué ici sur les lignes fautives, et refusé par l'API.
   */
  const codesEnDouble = useMemo(() => {
    const compte = new Map<string, number>();
    lignes.forEach((l) => {
      const c = l.codeExamenClient.trim();
      if (!c || !l.performed) return;
      compte.set(c, (compte.get(c) ?? 0) + 1);
    });
    return new Set(
      Array.from(compte.entries())
        .filter(([, n]) => n > 1)
        .map(([c]) => c)
    );
  }, [lignes]);

  /** Une entrée par examen, indexée sur le code NEURACORP, qui ne change jamais. */
  const etatSuivi = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const l of lignes) out[l.codeExamen] = l;
    return out;
  }, [lignes]);

  const { modifications, marquerEnregistre } = useSuiviModifications(etatSuivi, !chargement);

  // Sur une amorce, rien n'est encore en base : tout le tableau est à enregistrer.
  const aEnregistrer = amorce ? lignes.length : modifications;

  async function enregistrer() {
    setErreur(null);
    setEnregistrement(true);
    try {
      const r = await fetch(`/api/konnect-examens?userProductId=${userProductId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examens: lignes }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error ?? "Enregistrement refusé.");
      setInitial(lignes);
      setAmorce(false);
      marquerEnregistre();
      setSucces(true);
    } catch (e: any) {
      setErreur(e?.message ?? "Enregistrement impossible.");
    } finally {
      setEnregistrement(false);
    }
  }

  if (chargement) {
    return (
      <PageContainer title="Mapping d'examens" description="Correspondance avec votre RIS">
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress sx={{ color: BRAND }} />
        </Box>
      </PageContainer>
    );
  }

  const visibles = filtrees.slice(page * PAR_PAGE, page * PAR_PAGE + PAR_PAGE);

  return (
    <PageContainer title="Mapping d'examens" description="Correspondance avec votre RIS">
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 700, color: INK, mb: 0.5 }}>
          Mapping d&apos;examens
        </Typography>
        <Typography variant="body2" sx={{ color: INK_MUTED, mb: 2.5 }}>
          À gauche, notre référentiel. À droite, les codes de{" "}
          <strong>votre logiciel de gestion</strong> : ce sont eux qui servent à créer
          le rendez-vous, ils doivent correspondre exactement. Un examen sans code
          n&apos;est pas proposé au patient.
        </Typography>

        <Alert severity="info" icon={false} sx={{ mb: 2.5 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: INK, mb: 0.5 }}>
            Deux cases, deux décisions
          </Typography>
          <Typography sx={{ fontSize: 13, color: INK_MUTED }}>
            <strong>Pratiqué</strong> : vous faites cet examen, le portail le reconnaît.
            Décoché, le patient qui le demande voit votre numéro de téléphone.
            <br />
            <strong>Réservable en ligne</strong> : parmi ceux que vous pratiquez, ceux
            que le patient réserve seul. Décoché, aucun créneau ne lui est proposé, on
            lui offre de laisser son numéro et vous retrouvez sa demande dans
            « Demandes de rappel ».
          </Typography>
        </Alert>

        {avertissement && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {avertissement}
          </Alert>
        )}

        {/* Lot I : ce que le logiciel du centre dit de ces codes. On CONSTATE, on ne
            corrige pas. Le client sait ce qu'il fait ; ce qu'il ne peut pas savoir,
            c'est qu'un code mal recopie ne produit aucune erreur, juste un examen que
            le portail ne saura jamais reserver. */}
        {estAdmin && ecarts && ecarts.nb_codes_inconnus > 0 && (
          <Alert severity="error" sx={{ mb: 2 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>
              {ecarts.nb_codes_inconnus} code
              {ecarts.nb_codes_inconnus > 1 ? "s" : ""} que votre logiciel ne reconnaît
              pas
            </Typography>
            Ces examens ne seront jamais proposés au patient : votre logiciel ne les
            ouvre pas à la prise de rendez-vous en ligne, ou le code est différent.
            Vérifiez-les chez vous, puis corrigez-les ici.
            <Typography sx={{ fontSize: 12.5, mt: 1, fontFamily: "monospace" }}>
              {ecarts.codes_inconnus.join(", ")}
              {ecarts.nb_codes_inconnus > ecarts.codes_inconnus.length
                ? ` … et ${ecarts.nb_codes_inconnus - ecarts.codes_inconnus.length} autre(s)`
                : ""}
            </Typography>
          </Alert>
        )}

        {estAdmin && ecarts && ecarts.nb_types_incoherents > 0 && (
          <Alert severity="error" sx={{ mb: 2 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>
              {ecarts.nb_types_incoherents} type
              {ecarts.nb_types_incoherents > 1 ? "s" : ""} qui ne correspond
              {ecarts.nb_types_incoherents > 1 ? "ent" : ""} pas
            </Typography>
            Le portail cherche les créneaux avec le couple type + code. Quand le type
            ne correspond pas, aucun créneau n&apos;est trouvé et le patient croit que
            vous êtes complet.
            <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5 }}>
              {ecarts.types_incoherents.map((t) => (
                <li key={t.code}>
                  <Typography sx={{ fontSize: 12.5, fontFamily: "monospace" }}>
                    {t.code} : vous avez saisi « {t.saisi} », votre logiciel dit
                    « {t.attendu} »
                  </Typography>
                </li>
              ))}
            </Box>
          </Alert>
        )}

        {estAdmin && ecarts && ecarts.nb_absents_du_mapping > 0 && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>
              {ecarts.nb_absents_du_mapping} examen
              {ecarts.nb_absents_du_mapping > 1 ? "s" : ""} que vous ouvrez en ligne
              sans l&apos;avoir renseigné ici
            </Typography>
            Votre logiciel les accepte à la réservation, mais aucune ligne ne porte
            leur code : le portail ne les propose pas. Si ce sont des examens que vous
            pratiquez, complétez la ligne correspondante.
            <Typography sx={{ fontSize: 12.5, mt: 1, fontFamily: "monospace" }}>
              {ecarts.absents_du_mapping.join(", ")}
              {ecarts.nb_absents_du_mapping > ecarts.absents_du_mapping.length
                ? ` … et ${ecarts.nb_absents_du_mapping - ecarts.absents_du_mapping.length} autre(s)`
                : ""}
            </Typography>
          </Alert>
        )}

        <Paper
          variant="outlined"
          sx={{ p: 2, mb: 2, borderColor: BORDER, borderRadius: 2, bgcolor: SURFACE }}
        >
          {/*
            BARRE REPLIABLE (14/09/2026). Quatre filtres, deux boutons d'import et
            deux pastilles de comptage font plus de 1 400 px sur une ligne : sous
            cette largeur, tout ce qui etait a droite sortait de l'ecran sans meme
            une barre de defilement.

            `useFlexGap` est indispensable : le `spacing` de Stack pose des MARGES,
            qui ne savent pas se replier proprement, la ou `gap` suit le passage a la
            ligne. Et le remplisseur `flexGrow` qui poussait les pastilles a droite a
            ete remplace par un `ml: auto` sur leur groupe : dans un conteneur qui se
            replie, une boite qui grandit prend une ligne entiere pour elle seule.
          */}
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.5}
            useFlexGap
            flexWrap="wrap"
            alignItems={{ sm: "center" }}
          >
            <TextField
              size="small"
              placeholder="Rechercher un examen"
              value={recherche}
              onChange={(e) => {
                setRecherche(e.target.value);
                setPage(0);
              }}
              sx={{ flex: "1 1 240px", minWidth: 200 }}
            />
            <TextField
              size="small"
              select
              label="Type"
              value={filtreType}
              onChange={(e) => {
                setFiltreType(e.target.value);
                setPage(0);
              }}
              sx={{ minWidth: 170 }}
            >
              <MenuItem value="tous">Tous les types</MenuItem>
              {types.map((t) => (
                <MenuItem key={t} value={t}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <ExamTypeBadge type={t} variant="compact" />
                    <Typography variant="body2">{EXAM_TYPE_SHORT[t] ?? t}</Typography>
                  </Stack>
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              select
              label="Attribution"
              value={filtreAttribution}
              onChange={(e) => {
                setFiltreAttribution(e.target.value as FiltreAttribution);
                setPage(0);
              }}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="tous">Tous</MenuItem>
              <MenuItem value="attribues">Avec code</MenuItem>
              <MenuItem value="non_attribues">Sans code</MenuItem>
            </TextField>
            <TextField
              size="small"
              select
              label="Chemin"
              value={filtreChemin}
              onChange={(e) => {
                setFiltreChemin(e.target.value as FiltreChemin);
                setPage(0);
              }}
              sx={{ minWidth: 200 }}
            >
              <MenuItem value="tous">Tous</MenuItem>
              <MenuItem value="bout_en_bout">Réservable en ligne</MenuItem>
              <MenuItem value="rappel">Sur rappel</MenuItem>
            </TextField>
            {/* Remplir 266 codes à la main est le vrai coût de l'installation.
                L'import ne fait que préparer l'état de l'écran : c'est le bouton
                « Enregistrer » du bas qui écrit, comme pour une saisie manuelle. */}
            {/* `codeRisUnique` : le catalogue de Konnect porte le code RIS comme
                identité de l'examen réservable, deux lignes sur le même code y sont
                indistinguables. C'est propre à ce produit, LyraeTalk partage les
                siens. Voir la prop du composant. */}
            <ImportExportMapping
              lignes={lignes}
              champs={CHAMPS_KONNECT}
              onAppliquer={setLignes}
              codeRisUnique
            />
            {/* A droite quand la place le permet, sur leur propre ligne sinon. */}
            <Stack
              direction="row"
              spacing={1}
              useFlexGap
              flexWrap="wrap"
              alignItems="center"
              sx={{ ml: { sm: "auto" } }}
            >
              <Chip
                label={`${attribues} examen${attribues > 1 ? "s" : ""} proposé${
                  attribues > 1 ? "s" : ""
                } au patient`}
                sx={{
                  fontWeight: 600,
                  color: attribues > 0 ? BRAND_DARK : INK_MUTED,
                  bgcolor: attribues > 0 ? "rgba(var(--accent-rgb), 0.12)" : SURFACE_MUTED,
                }}
              />
              {surRappel > 0 && (
                <Chip
                  label={`dont ${surRappel} sur rappel`}
                  sx={{ fontWeight: 600, color: "#B4602A", bgcolor: "#FCF0E6" }}
                />
              )}
            </Stack>
          </Stack>
        </Paper>

        {/* `TableContainer component={Paper}` : c'est lui qui porte le cadre et le
            `overflow-x: auto`. En fiches il n'y a rien a faire defiler, la regle est
            donc inerte, et un second conteneur n'apporterait rien. */}
        <TableContainer
          component={Paper}
          variant="outlined"
          sx={{ overflowX: "auto", borderColor: BORDER, borderRadius: 2 }}
        >
          {enFiches ? (
            /* Écran étroit : une fiche par examen, tous ses champs visibles. */
            <Stack spacing={1.25} sx={{ p: 1.5 }}>
              {visibles.map((l) => {
                const enDouble =
                  l.performed && codesEnDouble.has(l.codeExamenClient.trim());
                const inactif = !l.performed;
                return (
                  <CarteMapping
                    key={l.codeExamen}
                    performed={l.performed}
                    onPerformed={(v) => maj(l.codeExamen, "performed", v)}
                    typeExamen={l.typeExamen}
                    libelle={l.libelle}
                    codeExamen={l.codeExamen}
                  >
                    <RangeeChamp libelle="Code / Libellé patient">
                      <CelluleCodeLibelle
                        code={l.codeExamenClient}
                        libelle={l.libelleClient}
                        placeholderLibelle={l.libelle ?? ""}
                        onCode={(v) => maj(l.codeExamen, "codeExamenClient", v)}
                        onLibelle={(v) => maj(l.codeExamen, "libelleClient", v)}
                        disabled={inactif}
                        erreurCode={enDouble}
                        messageErreur="Code en double"
                      />
                    </RangeeChamp>

                    <RangeeChamp libelle="Type">
                      <CelluleType
                        valeur={l.typeExamenClient}
                        options={typesClient}
                        onChange={(v) => maj(l.codeExamen, "typeExamenClient", v)}
                        disabled={inactif}
                      />
                    </RangeeChamp>

                    <RangeeChamp libelle="Injecté">
                      <CelluleInjection
                        injecte={l.examenInjecte}
                        code={l.codeExamenInjection ?? ""}
                        onInjecte={(v) => maj(l.codeExamen, "examenInjecte", v)}
                        onCode={(v) => maj(l.codeExamen, "codeExamenInjection", v)}
                        disabled={inactif}
                      />
                    </RangeeChamp>

                    <RangeeChamp libelle="Réservable en ligne">
                      <CaseMapping
                        coche={l.reservableEnLigne}
                        disabled={inactif}
                        onChange={(v) => maj(l.codeExamen, "reservableEnLigne", v)}
                      />
                    </RangeeChamp>

                    <RangeeChamp libelle="Ordonnance">
                      <CaseMapping
                        coche={l.ordoOblig}
                        disabled={inactif}
                        onChange={(v) => maj(l.codeExamen, "ordoOblig", v)}
                      />
                    </RangeeChamp>
                  </CarteMapping>
                );
              })}
              {filtrees.length === 0 && (
                <Typography
                  variant="body2"
                  sx={{ color: INK_MUTED, textAlign: "center", py: 5 }}
                >
                  {lignes.length === 0
                    ? "Aucun examen au référentiel."
                    : "Aucun examen ne correspond à ces filtres."}
                </Typography>
              )}
            </Stack>
          ) : (
          <Table size="small" sx={{ minWidth: 1180 }}>
            <TableHead>
              <TableRow>
                <EnTeteMapping
                  aide="Le centre fait cet examen. Décoché, le portail ne le reconnaît pas et le patient qui le demande voit votre numéro de téléphone."
                  largeur={80}
                  align="center"
                >
                  Pratiqué
                </EnTeteMapping>
                <EnTeteMapping aide="Notre référentiel : modalité, libellé et code internes.">
                  Examen
                </EnTeteMapping>
                <EnTeteMapping
                  aide="Le code de cet examen dans votre logiciel de gestion, et en dessous ce que lit le patient. Sans le code, l'examen n'est pas réservable. Libellé laissé vide, notre libellé est utilisé."
                  largeur={220}
                >
                  Code / Libellé patient
                </EnTeteMapping>
                <EnTeteMapping
                  aide="Le type dans votre logiciel. La liste propose ceux que vous avez déjà saisis. Facultatif."
                  largeur={130}
                >
                  Type
                </EnTeteMapping>
                <EnTeteMapping
                  aide="Examen avec produit de contraste. Déclenche le questionnaire d'injection. Cochez pour saisir le code de la version injectée, si votre logiciel en a un distinct."
                  largeur={150}
                >
                  Injecté
                </EnTeteMapping>
                <EnTeteMapping
                  aide="Le patient choisit son créneau et le rendez-vous est posé. Décoché, aucun créneau ne lui est proposé : on lui offre de laisser son numéro et vous le rappelez."
                  largeur={130}
                  align="center"
                >
                  Réservable en ligne
                </EnTeteMapping>
                <EnTeteMapping
                  aide="Le portail demande au patient de déposer son ordonnance, et signale le dossier au secrétariat tant qu'elle n'est pas validée. Il ne bloque pas la réservation."
                  largeur={105}
                  align="center"
                >
                  Ordonnance
                </EnTeteMapping>
              </TableRow>
            </TableHead>
            <TableBody>
              {visibles.map((l) => {
                const enDouble = l.performed && codesEnDouble.has(l.codeExamenClient.trim());
                return (
                  <TableRow
                    key={l.codeExamen}
                    hover
                    sx={{
                      "&:nth-of-type(odd)": { bgcolor: "#FBFDFC" },
                      "&:hover": { bgcolor: SURFACE_HOVER + " !important" },
                      "& > td": { borderBottom: `1px solid ${BORDER}`, py: 1 },
                      opacity: l.performed ? 1 : 0.45,
                    }}
                  >
                    <TableCell align="center">
                      <CaseMapping
                        coche={l.performed}
                        onChange={(v) => maj(l.codeExamen, "performed", v)}
                      />
                    </TableCell>

                    <TableCell>
                      <CelluleExamen
                        typeExamen={l.typeExamen}
                        libelle={l.libelle}
                        codeExamen={l.codeExamen}
                      />
                    </TableCell>

                    <TableCell>
                      <CelluleCodeLibelle
                        code={l.codeExamenClient}
                        libelle={l.libelleClient}
                        placeholderLibelle={l.libelle ?? ""}
                        onCode={(v) => maj(l.codeExamen, "codeExamenClient", v)}
                        onLibelle={(v) => maj(l.codeExamen, "libelleClient", v)}
                        disabled={!l.performed}
                        erreurCode={enDouble}
                        messageErreur="Code en double"
                      />
                    </TableCell>

                    <TableCell>
                      <CelluleType
                        valeur={l.typeExamenClient}
                        options={typesClient}
                        onChange={(v) => maj(l.codeExamen, "typeExamenClient", v)}
                        disabled={!l.performed}
                      />
                    </TableCell>

                    <TableCell>
                      <CelluleInjection
                        injecte={l.examenInjecte}
                        code={l.codeExamenInjection ?? ""}
                        onInjecte={(v) => maj(l.codeExamen, "examenInjecte", v)}
                        onCode={(v) => maj(l.codeExamen, "codeExamenInjection", v)}
                        disabled={!l.performed}
                      />
                    </TableCell>

                    <TableCell align="center">
                      <CaseMapping
                        coche={l.reservableEnLigne}
                        disabled={!l.performed}
                        onChange={(v) => maj(l.codeExamen, "reservableEnLigne", v)}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <CaseMapping
                        coche={l.ordoOblig}
                        disabled={!l.performed}
                        onChange={(v) => maj(l.codeExamen, "ordoOblig", v)}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtrees.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                    <Typography variant="body2" sx={{ color: INK_MUTED }}>
                      {lignes.length === 0
                        ? "Aucun examen au référentiel."
                        : "Aucun examen ne correspond à ces filtres."}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          )}
          <TablePagination
            component="div"
            count={filtrees.length}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={PAR_PAGE}
            rowsPerPageOptions={[PAR_PAGE]}
            labelRowsPerPage="Par page"
            labelDisplayedRows={({ from, to, count }) => `${from} à ${to} sur ${count}`}
            sx={{ borderTop: `1px solid ${BORDER}`, color: INK_MUTED }}
          />
        </TableContainer>

        {codesEnDouble.size > 0 && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Un même code est attribué à plusieurs examens. Le portail ne saurait pas
            lequel réserver : chaque code doit être unique.
          </Alert>
        )}
        {erreur && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {erreur}
          </Alert>
        )}

        <BarreEnregistrement
          modifications={aEnregistrer}
          enregistrement={enregistrement}
          onEnregistrer={enregistrer}
          onAnnuler={amorce ? undefined : () => setLignes(initial)}
          blocage={
            codesEnDouble.size > 0
              ? "Un même code est attribué à plusieurs examens."
              : lignes.length === 0
                ? "Aucun examen à enregistrer."
                : null
          }
          libelle="Enregistrer le mapping"
        />

        <Snackbar
          open={succes}
          autoHideDuration={4000}
          onClose={() => setSucces(false)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert severity="success" onClose={() => setSucces(false)}>
            Mapping enregistré. Le portail patient l&apos;appliquera dans la minute.
          </Alert>
        </Snackbar>
      </Box>
    </PageContainer>
  );
}
