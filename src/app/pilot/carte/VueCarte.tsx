"use client";

import { useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Accordion, AccordionDetails, AccordionSummary, Box, Button, Stack, TextField, Typography } from "@mui/material";
import { IconChevronDown } from "@tabler/icons-react";
import { JETONS } from "@/pilot/jetons";
import { LIBELLES } from "@/pilot/lib/pipeline";
import { LIBELLES_TEMPERATURE } from "@/pilot/lib/organisations/temperature";
import { NIVEAUX_TEMPERATURE } from "@/pilot/lib/organisations/temperatureAffichage";
import { INCONNU } from "@/pilot/lib/prospection/regles";
import {
  CLES_FILTRES, TOUS_LES_CONCURRENTS, adresseFiltres, ajusterFiltres, compterFiltres, famillesPresentes, filtrer, htmlMarqueur, legende, lienFiche,
  modeConcurrents, perimetreDuMode, phraseCompteurs, raisonPosition, repartirParPosition, type CentreCarte, type ConcurrentCarte, type EntreeLegende, type FiltresCarte,
} from "@/pilot/lib/carte/affichage";

/** Le navigateur seul charge Leaflet : il lit `window`, le rendu serveur échouerait. */
const CarteLeaflet = dynamic(() => import("./CarteLeaflet"), {
  ssr: false,
  loading: () => <Box role="status" sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "text.secondary", fontSize: 14 }}>Chargement de la carte…</Box>,
});

/** Sous 600 px, la carte prend l'écran utile : sous l'en-tête fixe (68 px), le haut de page (16 px) et la barre d'onglets flottante (76 px, plus une marge). */
const HAUTEUR_TELEPHONE = "calc(100dvh - 168px - env(safe-area-inset-bottom, 0px))";
const PAR_LOT = 30;

type Panneau = "filtres" | "legende" | null;

/**
 * L'écran Carte (lot U). Les centres sont lus une fois par la page serveur ; les
 * filtres s'appliquent ici, sans nouvelle lecture, et vivent dans l'adresse de la
 * page (codes et identifiants seulement, C-36). Sous 600 px, les filtres et la
 * légende s'ouvrent à la demande : la carte garde l'écran.
 */
export function VueCarte({ centres, concurrents, comptes, filtresInitiaux, moiId }: {
  centres: CentreCarte[]; concurrents: ConcurrentCarte[]; comptes: { id: number; name: string | null }[];
  filtresInitiaux: FiltresCarte; moiId: number;
}) {
  const [filtres, setFiltres] = useState<FiltresCarte>(filtresInitiaux);
  const [panneau, setPanneau] = useState<Panneau>(null);
  const perimetre = useMemo(() => filtrer(centres, filtres, moiId), [centres, filtres, moiId]);
  const { surLaCarte, aVerifier, pasLocalises } = useMemo(() => repartirParPosition(perimetre), [perimetre]);
  const entrees = useMemo(() => legende(surLaCarte, filtres, concurrents), [surLaCarte, filtres, concurrents]);
  const actifs = compterFiltres(filtres);
  const concurrentsActifs = modeConcurrents(filtres);
  // Les familles de RIS proposées : celles du périmètre du mode (affaires perdues comprises en mode concurrents).
  const familles = useMemo(() => famillesPresentes(perimetreDuMode(centres, filtres)), [centres, filtres]);

  function changer(cle: (typeof CLES_FILTRES)[number], valeur: string) {
    // Une famille de RIS que le nouveau mode ne montre pas est retirée.
    const suivants = ajusterFiltres({ ...filtres, [cle]: valeur || undefined } as FiltresCarte, centres);
    setFiltres(suivants);
    window.history.replaceState(null, "", `/pilot/carte${adresseFiltres(suivants)}`);
  }
  function effacer() { setFiltres({}); window.history.replaceState(null, "", "/pilot/carte"); }

  return <Stack spacing={1.5} sx={{ minWidth: 0 }}>
    {/* Sous 600 px, ce bloc seul prend l'écran utile ; les listes viennent dessous, en faisant défiler la page. */}
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, minWidth: 0, height: { xs: HAUTEUR_TELEPHONE, sm: "auto" } }}>
    <Stack direction="row" flexWrap="wrap" useFlexGap gap={1.5} alignItems="center" sx={{ flexShrink: 0 }}>
      <Box sx={{ flex: "1 1 auto", minWidth: 0 }}>
        <Typography variant="h1" sx={{ fontSize: { xs: 26, sm: 34 } }}>Carte</Typography>
        <Typography sx={{ display: { xs: "none", sm: "block" }, color: "text.secondary", fontSize: 15, mt: 0.75 }}>
          Où sont les prospects, les clients et les concurrents.
        </Typography>
      </Box>
      <Stack direction="row" gap={0.5} sx={{ display: { xs: "flex", sm: "none" } }}>
        <Button size="small" onClick={() => setPanneau(panneau === "filtres" ? null : "filtres")} aria-expanded={panneau === "filtres"} aria-controls="carte-filtres">
          {actifs ? `Filtres (${actifs})` : "Filtres"}
        </Button>
        <Button size="small" onClick={() => setPanneau(panneau === "legende" ? null : "legende")} aria-expanded={panneau === "legende"} aria-controls="carte-legende">Légende</Button>
      </Stack>
    </Stack>

    <Stack id="carte-filtres" direction="row" flexWrap="wrap" useFlexGap gap={1} alignItems="center" sx={{ display: { xs: panneau === "filtres" ? "flex" : "none", sm: "flex" }, flexShrink: 0 }}>
      <Choix libelle="Afficher" tous="prospects et clients" valeur={filtres.qui} changer={(v) => changer("qui", v)}>
        <option value="prospects">Prospects</option>
        <option value="clients">Clients</option>
      </Choix>
      <Choix libelle="Température" tous="toutes" valeur={filtres.temperature} changer={(v) => changer("temperature", v)}>
        {NIVEAUX_TEMPERATURE.map((n) => <option key={n} value={n}>{LIBELLES_TEMPERATURE[n]}</option>)}
      </Choix>
      <Choix libelle="Concurrent en place" tous="tous" valeur={filtres.concurrent} changer={(v) => changer("concurrent", v)}>
        <option value={TOUS_LES_CONCURRENTS}>Un concurrent, lequel que ce soit</option>
        {concurrents.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
      </Choix>
      <Choix libelle="Commercial" tous="tous" valeur={filtres.commercial} changer={(v) => changer("commercial", v)}>
        <option value="moi">À moi</option>
        {comptes.filter((c) => c.id !== moiId).map((c) => <option key={c.id} value={c.id}>{c.name ?? "Compte interne"}</option>)}
        <option value={INCONNU}>Non attribué</option>
      </Choix>
      <Choix libelle="RIS" tous="tous" valeur={filtres.ris} changer={(v) => changer("ris", v)}>
        {familles.map((f) => <option key={f} value={f}>{f}</option>)}
        <option value={INCONNU}>Non renseigné</option>
      </Choix>
      <Choix libelle="Couleurs" tous="température et clients" valeur={concurrentsActifs ? "concurrents" : undefined} changer={(v) => changer("couleurs", v)} desactive={filtres.concurrent !== undefined}>
        <option value="concurrents">Par concurrent (établissements équipés et affaires perdues)</option>
      </Choix>
      {actifs > 0 && <Button size="small" onClick={effacer}>Effacer les filtres</Button>}
    </Stack>

    <Box id="carte-legende" role="group" aria-label="Légende de la carte" sx={{ display: { xs: panneau === "legende" ? "block" : "none", sm: "block" }, flexShrink: 0 }}>
      <Legende entrees={entrees} />
    </Box>

    <Typography role="status" sx={{ fontSize: 13, color: "text.secondary", flexShrink: 0 }}>
      {phraseCompteurs(surLaCarte.length, pasLocalises.length)}
    </Typography>

    {/* `isolation` : les couches de Leaflet (jusqu'à 1000) restent sous la barre du haut et la barre d'onglets. */}
    <Box sx={{ position: "relative", isolation: "isolate", overflow: "hidden", borderRadius: "18px", bgcolor: JETONS.gris, boxShadow: JETONS.ombre,
      flex: { xs: "1 1 0", sm: "none" }, minHeight: { xs: 240, sm: 0 }, height: { sm: "clamp(480px, calc(100dvh - 360px), 820px)" } }}>
      <CarteLeaflet affiches={surLaCarte} filtres={filtres} concurrents={concurrents} />
      {surLaCarte.length === 0 && <Box sx={{ position: "absolute", inset: 0, zIndex: 1000, display: "grid", placeItems: "center", p: 2, pointerEvents: "none" }}>
        <Box sx={{ maxWidth: 360, p: 2, borderRadius: "14px", textAlign: "center", pointerEvents: "auto", bgcolor: JETONS.verreIlot, backdropFilter: "blur(16px)", boxShadow: JETONS.ombreIlot }}>
          <Typography sx={{ fontSize: 14 }}>
            {actifs
              ? "Aucun centre localisé ne correspond à ces filtres."
              : "Aucun centre n'est encore localisé. La position se calcule toute seule après l'enregistrement d'une adresse."}
          </Typography>
          {actifs > 0 && <Button size="small" onClick={effacer} sx={{ mt: 0.5 }}>Effacer les filtres</Button>}
        </Box>
      </Box>}
    </Box>
    </Box>

    <ListeCentres id="a-verifier" titre="Position à vérifier" centres={aVerifier}
      vide="" intro="Ces centres sont sur la carte, au lieu le plus probable. Une adresse plus précise les placerait mieux." />
    <ListeCentres id="non-localises" titre="Pas encore localisés" centres={pasLocalises}
      vide={actifs ? "Tous les centres de cette vue sont sur la carte." : "Tous les centres sont sur la carte."}
      intro="Ces centres n'ont pas de position, donc pas de marqueur. Chacun dit pourquoi." />
  </Stack>;
}

function Choix({ libelle, tous, valeur, changer, desactive, children }: { libelle: string; tous: string; valeur?: string; changer: (v: string) => void; desactive?: boolean; children: ReactNode }) {
  return <TextField select hiddenLabel disabled={desactive} SelectProps={{ native: true }} value={valeur ?? ""} onChange={(e) => changer(e.target.value)}
    inputProps={{ "aria-label": libelle }} sx={{ maxWidth: "100%", ...(valeur ? { "& .MuiInputBase-root": { bgcolor: JETONS.accentFond } } : {}) }}>
    <option value="">{libelle} : {tous}</option>{children}
  </TextField>;
}

/** Le même HTML que le marqueur de la carte : la légende montre exactement ce que la carte dessine. */
function Echantillon({ e }: { e: Pick<EntreeLegende, "point" | "bord" | "forme" | "pointille"> }) {
  return <Box component="span" aria-hidden sx={{ display: "inline-flex", flexShrink: 0, width: 20, height: 20 }} dangerouslySetInnerHTML={{ __html: htmlMarqueur(e) }} />;
}

/** Une ligne par couleur : l'échantillon, le mot, le nombre. Jamais la couleur seule. */
function Legende({ entrees }: { entrees: EntreeLegende[] }) {
  if (!entrees.length) return <Typography sx={{ fontSize: 13, color: "text.secondary" }}>La légende apparaît avec les premiers centres affichés.</Typography>;
  return <Stack component="ul" direction="row" flexWrap="wrap" useFlexGap gap={{ xs: 1.25, sm: 2 }} sx={{ listStyle: "none", m: 0, p: 0 }}>
    {entrees.map((e) => <Box component="li" key={e.cle} sx={{ display: "inline-flex", alignItems: "center", gap: 1, minWidth: 0, fontSize: 13 }}>
      <Echantillon e={e} />
      <span>{e.libelle}{e.nombre !== null ? ` · ${e.nombre}` : ""}</span>
    </Box>)}
  </Stack>;
}

/** Une liste repliable de centres, avec la raison et le geste pour chacun. Vide : rien, ou une phrase qui dit pourquoi. */
function ListeCentres({ id, titre, centres, intro, vide }: { id: string; titre: string; centres: CentreCarte[]; intro: string; vide: string }) {
  const [combien, setCombien] = useState(PAR_LOT);
  if (!centres.length) return vide ? <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{vide}</Typography> : null;
  return <Accordion>
    <AccordionSummary expandIcon={<IconChevronDown size={18} aria-hidden />} aria-controls={`liste-${id}`} id={`titre-${id}`}>
      <Typography component="span" sx={{ fontWeight: 600 }}>{titre} · {centres.length}</Typography>
    </AccordionSummary>
    <AccordionDetails id={`liste-${id}`} sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 1 }}>{intro}</Typography>
      <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, maxHeight: 420, overflowY: "auto" }}>
        {centres.slice(0, combien).map((c) => {
          const { raison, geste } = raisonPosition(c.statut, c.enRetard);
          return <Box component="li" key={c.id} sx={{ py: 1.25, borderTop: `1px solid ${JETONS.filetInterne}`, minWidth: 0 }}>
            <Stack direction="row" flexWrap="wrap" useFlexGap gap={1} alignItems="baseline" justifyContent="space-between">
              <Box sx={{ minWidth: 0, flex: "1 1 220px" }}>
                <Typography component="div" sx={{ fontSize: 14, fontWeight: 600, overflowWrap: "anywhere" }}>{c.organisation}</Typography>
                <Typography component="div" sx={{ fontSize: 13, color: "text.secondary", overflowWrap: "anywhere" }}>
                  {c.centre}{c.ville ? `, ${c.ville}` : ""} · {LIBELLES[c.etape]}
                </Typography>
                <Typography component="div" sx={{ fontSize: 13, mt: 0.25 }}>{raison}</Typography>
              </Box>
              {geste && <Button size="small" component={Link} href={lienFiche(c.organisationId)}>{geste}</Button>}
            </Stack>
          </Box>;
        })}
      </Box>
      {centres.length > combien && <Button size="small" onClick={() => setCombien(combien + PAR_LOT)} sx={{ mt: 1 }}>Afficher la suite</Button>}
    </AccordionDetails>
  </Accordion>;
}
