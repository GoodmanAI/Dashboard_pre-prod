"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Box, Button, Card, CardContent, Chip, Stack, Typography } from "@mui/material";
import { DialogueFormulaire, envoyer } from "@/pilot/components/formulaires/DialogueFormulaire";
import { compter } from "@/pilot/lib/texte";
import { CODES_MODALITE } from "@/pilot/lib/apports/referentiel";
import type { CentreFiche, Dialogue, VagueFiche } from "./DialoguesFiche";
import { dateCourte, libelleCritique, libelleDateRealiste, libelleEcart, manquantesCourtes, type Estimation } from "@/pilot/lib/integration/estimation";
const date = (v: string) => new Date(v).toLocaleDateString("fr-FR", { timeZone: "UTC" });
/** « 2 IRM », « 1 CT » : le nombre de salles par modalité, dans l'ordre du référentiel. */
function resumeSalles(salles: readonly { modalite: string }[]): string[] {
  const parModalite = new Map<string, number>();
  for (const s of salles) parModalite.set(s.modalite, (parModalite.get(s.modalite) ?? 0) + 1);
  return CODES_MODALITE.filter((m) => parModalite.has(m)).concat([...parModalite.keys()].filter((m) => !CODES_MODALITE.includes(m))).map((m) => `${parModalite.get(m)} ${m}`);
}

export function CentresOrganisation({ centres, vagues, catalogue, ouvrir }: {
  centres: CentreFiche[]; vagues: VagueFiche[]; catalogue: { id: number; name: string }[];
  ouvrir: (d: Dialogue) => void;
}) {
  const router = useRouter();
  // Une correction de saisie (C-86) : un produit sans étape faite, un centre vide qui n'est pas le seul.
  const [retrait, setRetrait] = useState<{ url: string; titre: string; texte: string } | null>(null);
  const avecVagues = centres.length >= 2 && vagues.length > 0;
  const groupes = avecVagues ? [...vagues.map((vague) => ({ vague, id: vague.id })), { vague: null, id: null }] : [{ vague: null, id: undefined }];
  return <Stack spacing={2}>
    {!centres.length && <Typography color="text.secondary">Aucun centre. Ajoutez le site principal du client.</Typography>}
    {groupes.map(({ vague, id }) => {
      const visibles = centres.map((centre) => ({ ...centre,
        rattachements: id === undefined ? centre.rattachements : centre.rattachements.filter((r) => r.vagueId === id) }))
        .filter((c) => id === undefined || c.rattachements.length || id === null && !centres.find((original) => original.id === c.id)!.rattachements.length);
      return <Stack key={id ?? "sans"} spacing={2}>
        {avecVagues && <Box>
          <Typography variant="h2">{vague ? "Vague " + vague.numero + (vague.nom ? " · " + vague.nom : "") : "Sans vague"}</Typography>
          {vague && <>
            <Typography color="text.secondary">{vague.datePromise ? "Date promise : " + date(vague.datePromise) : "Pas de date promise pour cette vague"}</Typography>
            <Button onClick={() => ouvrir({ type: "vague", vague })}>Modifier la vague</Button>
          </>}
          {!visibles.length && <Typography color="text.secondary">Aucun produit dans ce groupe. Choisissez une vague avec le bouton Date promise d’un produit.</Typography>}
        </Box>}
        {visibles.map((centre) => <Card key={centre.id}><CardContent>
          <Stack direction="row" justifyContent="space-between">
            <Box><Typography variant="h3">{centre.nom}</Typography><Typography variant="body2" color="text.secondary">{[centre.codeSite, centre.adresse, [centre.codePostal, centre.ville].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}</Typography>
              {(centre.siret || centre.finess) && <Typography variant="caption" color="text.secondary" component="div">{[centre.siret && `SIRET ${centre.siret}`, centre.finess && `FINESS ${centre.finess}`].filter(Boolean).join(" · ")}</Typography>}
            </Box>
            <Button aria-label={"Modifier le centre " + centre.nom} onClick={() => ouvrir({ type: "centre", centre })}>Modifier</Button>
          </Stack>
          {/* Les salles, clé de facturation d'un abonnement par salle (C-90). */}
          <Stack direction="row" alignItems="center" flexWrap="wrap" useFlexGap gap={1} sx={{ mt: 1.5 }}>
            <Typography variant="body2" fontWeight={600}>{compter(centre.salles.length, "salle")}</Typography>
            {resumeSalles(centre.salles).map((m) => <Chip key={m} size="small" variant="outlined" label={m} />)}
            {!centre.salles.length && <Typography variant="body2" color="text.secondary">Aucune salle saisie : l&apos;abonnement par salle ne peut pas se calculer.</Typography>}
            <Button size="small" aria-label={"Salles du centre " + centre.nom} onClick={() => ouvrir({ type: "salles", centre: centres.find((c) => c.id === centre.id)! })}>{centre.salles.length ? "Gérer les salles" : "Ajouter des salles"}</Button>
          </Stack>
          <Stack spacing={2} sx={{ my: 2 }}>
            {centre.rattachements.map((r) => <Box key={r.id} sx={{ borderTop: 1, borderColor: "divider", pt: 2 }}>
              <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
                <Typography fontWeight={600}>{r.produit}</Typography>
                <Typography variant="body2" color="text.secondary">{r.faites}/{r.total}</Typography>
                <Typography variant="body2" color={r.bloquantes ? "warning.main" : "text.secondary"}>{compter(r.bloquantes, "bloquante ouverte", "bloquantes ouvertes", "Rien de bloquant")}</Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">{r.email ? "Compte Dashboard : " + r.email : "Pas encore de compte sur le Dashboard"}</Typography>
              <Typography variant="body2" color="text.secondary">{r.datePromise ? "Date promise : " + date(r.datePromise) : "Pas de date promise"}</Typography>
              {r.glissement.reports > 0 && <Typography variant="caption" display="block" color={r.glissement.alerte ? "warning.main" : "text.secondary"}>
                Reportée {compter(r.glissement.reports, "fois", "fois")}{r.glissement.joursCumules > 0 ? `, ${compter(r.glissement.joursCumules, "jour")} de glissement` : ""}
              </Typography>}
              {vague?.datePromise && r.datePromise !== vague.datePromise && <Typography variant="caption" display="block" color="text.secondary">Date propre à ce site, différente de celle de la vague.</Typography>}
              <EtatProduction estimation={r.estimation} />
              <Button onClick={() => ouvrir({ type: "date", rattachement: r })}>Date promise</Button>
              <Button onClick={() => ouvrir({ type: "compte", rattachement: r })}>Compte Dashboard</Button>
              <Button component={Link} href={`/pilot/integrations?centreProduitId=${r.id}`}>Check-list</Button>
              {r.faites === 0 && <Button color="error" onClick={() => setRetrait({ url: `/api/pilot/rattachements/${r.id}`, titre: "Retirer ce produit ?",
                texte: `${r.produit} sera retiré de ${centre.nom}, avec sa check-list. À faire seulement s'il a été ajouté par erreur.` })}>Retirer</Button>}
            </Box>)}
            {!centre.rattachements.length && <Typography variant="body2" color="text.secondary">Aucun produit rattaché.</Typography>}
          </Stack>
          <Button disabled={catalogue.every((p) => centres.find((c) => c.id === centre.id)!.rattachements.some((r) => r.productId === p.id))}
            onClick={() => ouvrir({ type: "rattachement", centre: centres.find((c) => c.id === centre.id)! })}>Ajouter un produit</Button>
          {centres.length >= 2 && !centres.find((c) => c.id === centre.id)!.rattachements.length && <Button color="error"
            onClick={() => setRetrait({ url: `/api/pilot/centres/${centre.id}`, titre: "Supprimer ce centre ?",
              texte: `${centre.nom} sera supprimé de la fiche. À faire seulement s'il a été saisi par erreur.` })}>Supprimer le centre</Button>}
        </CardContent></Card>)}
      </Stack>;
    })}
    <Stack direction="row" spacing={2}>
      <Button variant="outlined" onClick={() => ouvrir({ type: "centre" })}>Ajouter un centre</Button>
      {centres.length >= 2 && <Button onClick={() => ouvrir({ type: "vague" })}>Grouper en vague de mise en service</Button>}
      <Button component={Link} href="/pilot/integrations">Voir la check-list</Button>
    </Stack>
    {retrait && <DialogueFormulaire titre={retrait.titre} bouton="Confirmer" suppression fermer={() => setRetrait(null)} soumettre={async () => {
      await envoyer(retrait.url, "DELETE"); setRetrait(null); router.refresh();
    }}><Typography>{retrait.texte}</Typography></DialogueFormulaire>}
  </Stack>;
}

/** Prêt ou pas, ce qui manque et pourquoi, puis la date réaliste, toujours dite estimation. */
function EtatProduction({ estimation: e }: { estimation: Estimation }) {
  const termine = e.enProduction && e.pret;
  const statut = e.enProduction
    ? e.reserves ? "En service, étapes à finir" : e.miseEnProductionLe ? `En service depuis le ${dateCourte(e.miseEnProductionLe)}` : "En production"
    : e.pret ? "Prêt pour la mise en service" : "Pas encore prêt";
  const { visibles, suite } = manquantesCourtes(e.manquantes);
  return <Box sx={{ my: 1 }}>
    <Typography variant="body2" fontWeight={600} color={e.pret ? "success.main" : "warning.main"}>{statut}</Typography>
    {visibles.map((m) => <Typography key={m.cle} variant="body2" color="text.secondary">{m.libelle} : {m.motif}</Typography>)}
    {suite && <Typography variant="body2" color="text.secondary">{suite}</Typography>}
    {!termine && <>
      <Typography variant="body2">
        Date estimée : {libelleDateRealiste(e)} · <Box component="span" sx={{ color: e.ecartJours !== null && e.ecartJours > 0 ? "warning.main" : "text.secondary" }}>{libelleEcart(e.ecartJours)}</Box>
      </Typography>
      {e.etapeCritique && <Typography variant="caption" display="block" color="text.secondary">{libelleCritique(e.etapeCritique)}</Typography>}
    </>}
    {e.suiviRenforceJusquAu && <Typography variant="caption" display="block">Suivi renforcé jusqu&apos;au {dateCourte(e.suiviRenforceJusquAu)}</Typography>}
  </Box>;
}
