import Link from "next/link";
import { Alert, Box, Button, Card, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { IconDownload, IconSchool } from "@tabler/icons-react";
import { utilisateurCourant } from "@/pilot/lib/session";
import { peutVoirCa } from "@/pilot/lib/autorisations";
import { AccesRefuse } from "@/pilot/components/AccesRefuse";
import { Bloc, EnTete, Ligne } from "@/pilot/components/Bloc";
import { euros, eurosPrecis } from "@/pilot/lib/argent";
import { chargerFacturation } from "@/pilot/lib/facturationSalles/charger";
import { ttc, type ProduitSalle } from "@/pilot/lib/facturationSalles/calcul";

export const dynamic = "force-dynamic";

const TABLEAU = {
  tableLayout: "fixed",
  "& td, & th": { px: { xs: 0.75, sm: 1.25 }, overflowWrap: "anywhere", fontSize: 13, fontVariantNumeric: "tabular-nums" },
  "& th": { fontSize: 12, overflowWrap: "normal", hyphens: "auto" },
} as const;
const PETITE = { display: { xs: "none", sm: "table-cell" } };
const MOYENNE = { display: { xs: "none", md: "table-cell" } };

const NOM: Record<ProduitSalle, string> = { talk: "Talk", konnect: "Konnect" };
const montant = (cts: number | null) => (cts === null ? "Prix à renseigner" : eurosPrecis(cts));
/** Un montant lu sur le contrat du client (25/11/2026) : le dire sous le chiffre. */
function MontantProduit({ cts, source }: { cts: number | null; source: "grille" | "contrat" }) {
  return <>
    {montant(cts)}
    {source === "contrat" && <Typography component="div" sx={{ fontSize: 12, color: "text.secondary" }}>{cts === 0 ? "compris dans le contrat" : "prix du contrat"}</Typography>}
  </>;
}
const jourFr = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/**
 * La facturation à la salle, passée de l'admin du Dashboard à Pilot le 23/11/2026
 * (plan 2026-11-pilot-dans-le-dashboard). Ce que chaque client paie par mois,
 * client par client et site par site, au prix de la grille de Pilot. Les salles
 * se cochent toujours au Dashboard : elles règlent aussi la prise de RDV des robots.
 */
export default async function PageFacturation() {
  const moi = await utilisateurCourant();
  if (!peutVoirCa(moi)) {
    return (
      <AccesRefuse
        titre="Facturation"
        raison={moi.profil === "DEVELOPPEUR" ? "Un développeur ne voit pas les montants facturés." : "Le droit « Voir le chiffre d'affaires » ne vous a pas été donné."}
        suite="Le super-administrateur peut vous l'ouvrir depuis l'écran Équipe."
      />
    );
  }
  const f = await chargerFacturation();
  const aRegler = f.lignes.filter((l) => l.aRegler.length > 0);
  const clients = new Set(aRegler.map((l) => l.userId)).size;
  return (
    <Stack spacing={3}>
      <EnTete
        titre="Facturation"
        sousTitre={f.grilleDu
          ? <>Ce que chaque client paie par mois, salle par salle, au prix de la grille du {jourFr(f.grilleDu)}. Un client sous contrat paie le prix de son contrat, saisi sur sa fiche. Montants hors taxe.</>
          : <>Aucune grille de prix en vigueur. Créez-en une dans <Link href="/pilot/tarifs">Tarifs</Link>.</>}
      >
        <Button component="a" href="/api/pilot/facturation" variant="outlined" startIcon={<IconDownload size={18} />}>Exporter pour Excel</Button>
      </EnTete>

      <Box id="facturation-chiffres" sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" } }}>
        <Chiffre libelle="Total mensuel HT" valeur={euros(f.totalHtCentimes)} detail={f.incomplet ? "Total partiel : un prix manque." : `${euros(ttc(f.totalHtCentimes))} TTC`} />
        <Chiffre libelle="Prix d'une salle Talk" valeur={f.prix.talk === null ? "À renseigner" : eurosPrecis(f.prix.talk)} detail="Hors taxe, par mois" />
        <Chiffre libelle="Prix d'une salle Konnect" valeur={f.prix.konnect === null ? "À renseigner" : eurosPrecis(f.prix.konnect)} detail="Hors taxe, par mois" />
      </Box>

      {(f.prix.talk === null || f.prix.konnect === null) && (
        <Alert severity="warning" icon={false} action={<Button component={Link} href="/pilot/tarifs" color="inherit" size="small">Ouvrir les tarifs</Button>}>
          Le prix d&apos;une salle manque dans la grille en vigueur. Les lignes concernées restent sans montant tant qu&apos;il n&apos;est pas saisi.
        </Alert>
      )}

      {clients > 0 && (
        <Alert severity="info" icon={false}>
          {clients === 1 ? "Un client a" : `${clients} clients ont`} un produit sans aucune salle cochée. Les salles se cochent au Dashboard,
          dans Installation Talk et Installation Konnect.
        </Alert>
      )}

      <Card component="section" aria-label="Par client et par site" id="facturation-clients">
        <Typography variant="h2" sx={{ px: 2.75, pt: 2.25, pb: 1.5 }}>Par client et par site</Typography>
        {f.lignes.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ px: 2.75, pb: 2.75 }}>Aucun client n&apos;a Talk ou Konnect pour l&apos;instant.</Typography>
        ) : (
          <Table size="small" sx={TABLEAU}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: { xs: "45%", md: "26%" } }}>Client</TableCell>
                <TableCell sx={PETITE}>Site</TableCell>
                <TableCell align="right" sx={MOYENNE}>Salles Talk</TableCell>
                <TableCell align="right" sx={MOYENNE}>Talk HT</TableCell>
                <TableCell align="right" sx={MOYENNE}>Salles Konnect</TableCell>
                <TableCell align="right" sx={MOYENNE}>Konnect HT</TableCell>
                <TableCell align="right">Total HT</TableCell>
                <TableCell align="right" sx={PETITE}>Total TTC</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {f.lignes.map((l) => (
                <TableRow key={`${l.userId}-${l.codeSite ?? ""}`}>
                  <TableCell sx={{ fontWeight: 600 }}>
                    {l.nom}
                    {l.aRegler.length > 0 && (
                      <Typography component="div" sx={{ fontSize: 12, color: "warning.dark", fontWeight: 500 }}>
                        {l.aRegler.map((p) => NOM[p]).join(" et ")} sans salle cochée
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell sx={PETITE}>{l.codeSite ?? "Non précisé"}</TableCell>
                  <TableCell align="right" sx={MOYENNE}>{l.talk}</TableCell>
                  <TableCell align="right" sx={MOYENNE}><MontantProduit cts={l.htCentimes.talk} source={l.sources.talk} /></TableCell>
                  <TableCell align="right" sx={MOYENNE}>{l.konnect}</TableCell>
                  <TableCell align="right" sx={MOYENNE}><MontantProduit cts={l.htCentimes.konnect} source={l.sources.konnect} /></TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{montant(l.totalHtCentimes)}</TableCell>
                  <TableCell align="right" sx={PETITE}>{l.totalHtCentimes === null ? "" : eurosPrecis(ttc(l.totalHtCentimes))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Bloc
        titre="Formations de POC à facturer"
        id="facturation-formations"
        nombre={f.formations.length}
        icone={IconSchool}
        teinte="violet"
        vide={f.formations.length === 0 ? "Toutes les formations de POC ont leur facture émise." : undefined}
      >
        {f.formations.map((x) => (
          <Ligne
            key={x.organisationId}
            nom={<Link href={`/pilot/organisations/${x.organisationId}`}>{x.nom}</Link>}
            detail={`POC commencé le ${jourFr(x.debuteLe)}`}
            date={x.montantCentimes === null ? "Prix à renseigner" : eurosPrecis(x.montantCentimes)}
          />
        ))}
      </Bloc>
    </Stack>
  );
}

function Chiffre({ libelle, valeur, detail }: { libelle: string; valeur: string; detail: string }) {
  return (
    <Card sx={{ px: 2.75, py: 2.25 }}>
      <Typography sx={{ fontSize: 13, color: "text.secondary", fontWeight: 500 }}>{libelle}</Typography>
      <Typography sx={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", mt: 0.5 }}>{valeur}</Typography>
      <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.25 }}>{detail}</Typography>
    </Card>
  );
}
