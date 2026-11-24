import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { TYPES_ORGANISATION } from "@/pilot/lib/organisations/referentielClient";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { EnTete } from "@/pilot/components/Bloc";
import { prisma } from "@/pilot/lib/prisma";
import { utilisateurCourant } from "@/pilot/lib/session";
import { LIBELLES, rubriqueDe, type Rubrique } from "@/pilot/lib/pipeline";
import { euros } from "@/pilot/lib/argent";
import { compter } from "@/pilot/lib/texte";
import { nombreDeSites } from "@/pilot/lib/organisations/sites";
import { familleRdv, familleRis, repartition } from "@/pilot/lib/organisations/familles";
import { JETONS, MOUVEMENT } from "@/pilot/jetons";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = TYPES_ORGANISATION;

// Les colonnes secondaires cèdent la place plutôt que de créer une barre horizontale.
const SECONDAIRE = { display: { xs: "none", lg: "table-cell" } };
const MOYENNE = { display: { xs: "none", sm: "table-cell" } };
// Les comptes de sites et de contacts laissent la place au RIS et à la prise de RDV,
// qui servent à trier le catalogue des prospects. Ils restent sur la fiche.
const TRES_LARGE = { display: { xs: "none", xl: "table-cell" } };
// Une valeur longue (« Doctolib (hôpital, imagerie à confirmer) ») passe à la ligne entre
// deux mots ; « anywhere » laisserait la colonne s'écraser et couper les mots.
const OUTIL = { ...SECONDAIRE, minWidth: 140, maxWidth: 200, overflowWrap: "break-word" };

/** Valeur de filtre pour « non renseigné ». */
const INCONNU = "inconnu";
const CLASSEMENTS = { etape: "Étape", ris: "RIS", rdv: "Prise de RDV" } as const;
type Classement = keyof typeof CLASSEMENTS;
/** Qui la liste montre (C-87) : les clients par défaut, les prospects, ou tout le monde. */
const VUES = { clients: "Clients", prospects: "Prospects", tous: "Tous" } as const;
type Vue = keyof typeof VUES;
type Parametres = { voir?: string; classer?: string; ris?: string; rdv?: string };

/** L'adresse de la page avec un réglage changé ; les autres réglages restent. */
function lien(p: Parametres, changement: Parametres): string {
  const suivants = { ...p, ...changement };
  const q = new URLSearchParams(Object.entries(suivants).filter(([, v]) => v) as [string, string][]).toString();
  return `/pilot/organisations${q ? `?${q}` : ""}`;
}

/**
 * La liste des clients (C-66) : classée par étape, par RIS ou par outil de prise
 * de RDV en ligne, et filtrée d'un clic sur la répartition. Les familles
 * regroupent les écritures d'un même outil (`src/lib/organisations/familles.ts`).
 */
export default async function Organisations({ searchParams }: { searchParams: Parametres }) {
  // Relu en base à chaque affichage : un accès retiré ferme la page à l'appel suivant (C-64).
  await utilisateurCourant();
  const voir: Vue = searchParams.voir && Object.hasOwn(VUES, searchParams.voir) ? searchParams.voir as Vue : "clients";
  const dansLaVue = (etape: Parameters<typeof rubriqueDe>[0]) => voir === "tous" || rubriqueDe(etape) === (voir as Rubrique);
  const classer: Classement = searchParams.classer && Object.hasOwn(CLASSEMENTS, searchParams.classer) ? searchParams.classer as Classement : "etape";
  const organisations = (await prisma.crmOrganisation.findMany({
    include: {
      responsable: { select: { name: true } },
      _count: { select: { centres: true, contacts: true } },
      contrats: { where: { statut: "ACTIF" }, include: { lignes: true } },
    },
    orderBy: [{ etape: "asc" }, { raisonSocialeNom: "asc" }],
  })).filter((o) => dansLaVue(o.etape)).map((o) => ({ ...o, familleRis: familleRis(o.ris), familleRdv: familleRdv(o.outilRdv) }));

  // La répartition se lit sur tous les clients ; le filtre de l'autre axe s'y applique, pour qu'on voie ce qu'on croise.
  const filtreRis = (o: (typeof organisations)[number]) => !searchParams.ris || (o.familleRis ?? INCONNU) === searchParams.ris;
  const filtreRdv = (o: (typeof organisations)[number]) => !searchParams.rdv || (o.familleRdv ?? INCONNU) === searchParams.rdv;
  const parRis = repartition(organisations.filter(filtreRdv).map((o) => o.familleRis));
  const parRdv = repartition(organisations.filter(filtreRis).map((o) => o.familleRdv));
  const visibles = organisations.filter((o) => filtreRis(o) && filtreRdv(o));

  // Classées par RIS ou par RDV : les groupes dans l'ordre de la répartition, les inconnus en dernier.
  const cleGroupe = (o: (typeof visibles)[number]) => (classer === "ris" ? o.familleRis : classer === "rdv" ? o.familleRdv : null);
  const ordre = new Map((classer === "ris" ? parRis : parRdv).map((r, i) => [r.famille, i]));
  const lignes = classer === "etape" ? visibles
    : [...visibles].sort((a, b) => (ordre.get(cleGroupe(a)) ?? 999) - (ordre.get(cleGroupe(b)) ?? 999) || a.raisonSocialeNom.localeCompare(b.raisonSocialeNom, "fr"));
  const filtres = (searchParams.ris ? 1 : 0) + (searchParams.rdv ? 1 : 0);

  return (
    <Stack spacing={2.5}>
      <EnTete titre="Clients" sousTitre={voir === "clients" ? "Les organisations qui ont signé : cabinets, groupes, GIE et hôpitaux." : voir === "prospects" ? "Les organisations qui n'ont pas encore signé, perdues et en pause comprises." : "Tous les prospects et clients : cabinets, groupes, GIE et hôpitaux."}>
        <Button component={Link} href="/pilot/organisations/nouveau" variant="contained">Nouveau client</Button>
      </EnTete>

      <Card sx={{ px: 2.5, py: 2 }}>
        <Stack spacing={1.5}>
          <Stack direction="row" flexWrap="wrap" useFlexGap gap={1.5} alignItems="center">
            <Typography variant="body2" color="text.secondary" sx={{ minWidth: 92 }}>Voir</Typography>
            <Box role="group" aria-label="Voir" sx={{ display: "inline-flex", bgcolor: JETONS.segment, borderRadius: "10px", p: "2px" }}>
              {(Object.keys(VUES) as Vue[]).map((v) => <Box key={v} component={Link} href={lien(searchParams, { voir: v === "clients" ? undefined : v, ris: undefined, rdv: undefined })}
                aria-pressed={v === voir} sx={segment(v === voir)}>{VUES[v]}</Box>)}
            </Box>
          </Stack>
          <Stack direction="row" flexWrap="wrap" useFlexGap gap={1.5} alignItems="center">
            <Typography variant="body2" color="text.secondary" sx={{ minWidth: 92 }}>Classer par</Typography>
            <Box role="group" aria-label="Classer par" sx={{ display: "inline-flex", bgcolor: JETONS.segment, borderRadius: "10px", p: "2px" }}>
              {(Object.keys(CLASSEMENTS) as Classement[]).map((c) => <Box key={c} component={Link} href={lien(searchParams, { classer: c === "etape" ? undefined : c })}
                aria-pressed={c === classer} sx={segment(c === classer)}>{CLASSEMENTS[c]}</Box>)}
            </Box>
            <Typography variant="body2" color="text.secondary" role="status" sx={{ ml: { sm: "auto" } }}>
              {compter(visibles.length, voir === "prospects" ? "prospect" : voir === "clients" ? "client" : "organisation")}{filtres ? ` sur ${organisations.length}` : ""}
            </Typography>
            {filtres > 0 && <Button size="small" component={Link} href={lien(searchParams, { ris: undefined, rdv: undefined })}>Effacer les filtres</Button>}
          </Stack>
          <Repartition titre="RIS" valeurs={parRis} actif={searchParams.ris} lienPour={(f) => lien(searchParams, { ris: f === searchParams.ris ? undefined : f })} />
          <Repartition titre="Prise de RDV" valeurs={parRdv} actif={searchParams.rdv} lienPour={(f) => lien(searchParams, { rdv: f === searchParams.rdv ? undefined : f })} />
        </Stack>
      </Card>

      <Card>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Nom</TableCell>
              <TableCell sx={SECONDAIRE}>Type</TableCell>
              <TableCell>Étape</TableCell>
              <TableCell sx={OUTIL}>RIS</TableCell>
              <TableCell sx={OUTIL}>Prise de RDV</TableCell>
              <TableCell align="right" sx={TRES_LARGE}>Sites</TableCell>
              <TableCell align="right" sx={TRES_LARGE}>Contacts</TableCell>
              <TableCell align="right" sx={MOYENNE}>Abonnements signés</TableCell>
              <TableCell sx={MOYENNE}>Responsable</TableCell>
              <TableCell sx={SECONDAIRE}>Dernier échange</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {!lignes.length && <TableRow><TableCell colSpan={10}>
              <Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>{filtres ? "Aucune organisation ne correspond. Effacez un filtre." : voir === "clients" ? "Aucun client signé pour l'instant." : "Aucune organisation."}</Typography>
            </TableCell></TableRow>}
            {lignes.map((o, i) => {
              const recurrent = o.contrats
                .flatMap((c) => c.lignes)
                .filter((l) => l.type === "ABONNEMENT")
                .reduce((t, l) => t + l.montantCentimes, 0);
              const groupe = cleGroupe(o);
              const nouveauGroupe = classer !== "etape" && (i === 0 || cleGroupe(lignes[i - 1]) !== groupe);
              return (
                <Fragment key={o.id}>
                  {nouveauGroupe && <TableRow>
                    <TableCell colSpan={10} sx={{ bgcolor: JETONS.surface, py: 1 }}>
                      <Typography variant="body2" fontWeight={600} component="span">{groupe ?? "Non renseigné"}</Typography>
                      <Typography variant="body2" color="text.secondary" component="span"> · {compter(lignes.filter((x) => cleGroupe(x) === groupe).length, "client")}</Typography>
                    </TableCell>
                  </TableRow>}
                  <TableRow hover>
                    <TableCell sx={{ minWidth: 200 }}>
                      <Link href={`/pilot/organisations/${o.id}`} style={{ fontWeight: 500 }}>
                        {o.raisonSocialeNom}
                      </Link>
                    </TableCell>
                    <TableCell sx={SECONDAIRE}>{TYPES[o.type] ?? o.type}</TableCell>
                    <TableCell>
                      <Chip label={LIBELLES[o.etape]} />
                    </TableCell>
                    <TableCell sx={OUTIL}>
                      <Valeur texte={o.ris} />
                      {o.ris && o.risVersion && <Precision>version {o.risVersion}</Precision>}
                    </TableCell>
                    <TableCell sx={OUTIL}><Valeur texte={o.outilRdv} /></TableCell>
                    <TableCell align="right" sx={TRES_LARGE}>{nombreDeSites(o.nombreSites, o._count.centres) ?? "Non renseigné"}</TableCell>
                    <TableCell align="right" sx={TRES_LARGE}>{o._count.contacts}</TableCell>
                    <TableCell align="right" sx={MOYENNE}>
                      {recurrent > 0 ? `${euros(recurrent)} / mois` : "Aucun"}
                    </TableCell>
                    <TableCell sx={MOYENNE}>{o.responsable?.name ?? "Non attribué"}</TableCell>
                    <TableCell sx={SECONDAIRE}>
                      {o.dernierEchangeLe
                        ? o.dernierEchangeLe.toLocaleDateString("fr-FR")
                        : "Jamais"}
                    </TableCell>
                  </TableRow>
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </Stack>
  );
}

/** Le segment actif du choix « Classer par », comme les autres contrôles segmentés de Pilot. */
function segment(actif: boolean) {
  return { display: "inline-flex", alignItems: "center", height: 30, px: 1.75, borderRadius: "8px", fontSize: 13, fontWeight: actif ? 600 : 500, whiteSpace: "nowrap",
    color: actif ? "text.primary" : "text.secondary", bgcolor: actif ? "background.paper" : "transparent", boxShadow: actif ? JETONS.ombreSegment : "none",
    transition: `background-color ${MOUVEMENT.rapide} ${MOUVEMENT.courbe}`, "&&:hover": { color: "text.primary" } };
}

/** Une ligne de pastilles : chaque famille avec son nombre. Un clic filtre, un second clic retire le filtre. */
function Repartition({ titre, valeurs, actif, lienPour }: {
  titre: string; valeurs: { famille: string | null; nombre: number }[]; actif?: string; lienPour: (famille: string) => string;
}) {
  return <Stack direction="row" flexWrap="wrap" useFlexGap gap={0.75} alignItems="center" role="group" aria-label={`Filtrer par ${titre}`}>
    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 92 }}>{titre}</Typography>
    {valeurs.map(({ famille, nombre }) => {
      const cle = famille ?? INCONNU;
      const choisi = actif === cle;
      return <Chip key={cle} component={Link} href={lienPour(cle)} clickable aria-pressed={choisi}
        label={`${famille ?? "Non renseigné"} · ${nombre}`} color={choisi ? "primary" : "default"} variant={choisi ? "filled" : "outlined"}
        sx={famille ? undefined : { color: choisi ? undefined : "text.secondary" }} />;
    })}
  </Stack>;
}

/** Case vide : en gris, pour que les valeurs connues ressortent d'un coup d'œil. */
function Inconnu() {
  return <Box component="span" sx={{ color: "text.secondary" }}>Inconnu</Box>;
}

/** Une ligne grise sous la valeur : la version, ou ce qui reste à confirmer. */
function Precision({ children }: { children: ReactNode }) {
  return <Box component="span" sx={{ display: "block", color: "text.secondary", fontSize: 12 }}>{children}</Box>;
}

/** « Doctolib (hôpital, imagerie à confirmer) » : l'outil d'abord, la réserve dessous. */
function Valeur({ texte }: { texte: string | null }) {
  if (!texte) return <Inconnu />;
  const reserve = texte.match(/^(.*\S)\s+\(([^()]*à confirmer[^()]*)\)$/);
  return reserve ? <>{reserve[1]}<Precision>{reserve[2]}</Precision></> : <>{texte}</>;
}
