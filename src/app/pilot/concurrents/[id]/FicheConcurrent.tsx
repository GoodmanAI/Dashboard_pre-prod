"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Box, Button, Chip, Snackbar, Stack, Typography } from "@mui/material";
import { IconBuildingStore, IconCoin, IconFlagOff, IconHistory, IconNotes } from "@tabler/icons-react";
import { Bloc, EnTete, Ligne } from "@/pilot/components/Bloc";
import { LIBELLES } from "@/pilot/lib/pipeline";
import { LIBELLES_TYPE_CONCURRENT } from "@/pilot/lib/concurrents/regles";
import { ancienneteReleve, PRIX_NON_RELEVE, prixInstallationAffiche, prixSalleAffiche, releveAncien, repartirEtablissements } from "@/pilot/lib/concurrents/affichage";
import { DialogueConcurrent, DialogueReleve, DialogueSuppressionConcurrent, DialogueSuppressionReleve } from "../DialoguesConcurrent";
import type { AffairePerdue, ConcurrentEcran, OrganisationEquipee, OrganisationLiee, ReleveEcran } from "../types";

const date = (valeur: string) => new Date(valeur).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

type Dialogue =
  | { type: "concurrent" } | { type: "suppression" }
  | { type: "releve"; releve?: ReleveEcran } | { type: "suppressionReleve"; releve: ReleveEcran };

/**
 * La fiche d'un concurrent : le prix en vigueur d'abord, puis l'offre et les notes,
 * l'historique des relevés, les établissements où il est en place et les affaires
 * perdues contre lui. Les textes longs se replient : aucune barre horizontale.
 */
export function FicheConcurrent({ concurrent, releves, centresEquipes, affairesPerdues, peutModifier }: {
  concurrent: ConcurrentEcran; releves: ReleveEcran[]; centresEquipes: OrganisationEquipee[]; affairesPerdues: AffairePerdue[]; peutModifier: boolean;
}) {
  const router = useRouter();
  const [dialogue, setDialogue] = useState<Dialogue | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const maintenant = new Date();
  const vigueur = releves.find((r) => r.enVigueur) ?? null;
  const ancien = vigueur ? releveAncien(vigueur.releveLe, maintenant) : false;
  const termine = (texte: string) => { setDialogue(null); setMessage(texte); router.refresh(); };
  // Le compte du bloc est celui de la liste : les établissements qui l'ont encore. Les clients de Lyrae viennent dessous.
  const { enPlace, passesChezLyrae } = repartirEtablissements(centresEquipes);
  const ligneEtablissement = (o: OrganisationLiee) => <Ligne key={o.id} nom={<Box component={Link} href={`/pilot/organisations/${o.id}`} sx={{ overflowWrap: "anywhere" }}>{o.raisonSocialeNom}</Box>}>
    <Chip size="small" label={LIBELLES[o.etape]} />
  </Ligne>;

  return <Stack spacing={2.5}>
    <Stack direction="row" spacing={0.75} sx={{ fontSize: 13, color: "text.secondary", minWidth: 0 }}>
      <Link href="/pilot/concurrents">Concurrents</Link><span>/</span><Box component="span" sx={{ overflowWrap: "anywhere" }}>{concurrent.nom}</Box>
    </Stack>
    <EnTete titre={<Box component="span" sx={{ overflowWrap: "anywhere" }}>{concurrent.nom}</Box>}
      sousTitre={<>{LIBELLES_TYPE_CONCURRENT[concurrent.type]}{concurrent.siteWeb && <> · <a href={concurrent.siteWeb} target="_blank" rel="noopener noreferrer" style={{ overflowWrap: "anywhere" }}>{concurrent.siteWeb.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "")}</a></>}</>}>
      {peutModifier && <Stack direction="row" flexWrap="wrap" useFlexGap gap={1}>
        <Button variant="outlined" onClick={() => setDialogue({ type: "suppression" })}>Supprimer</Button>
        <Button variant="outlined" onClick={() => setDialogue({ type: "concurrent" })}>Modifier</Button>
        <Button variant="contained" onClick={() => setDialogue({ type: "releve" })}>Ajouter un relevé</Button>
      </Stack>}
    </EnTete>

    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "repeat(2, minmax(0, 1fr))" }, gap: 2.5, alignItems: "start" }}>
      <Stack spacing={2.5} sx={{ minWidth: 0 }}>
        <Bloc titre="Prix en vigueur" icone={IconCoin} teinte="vert">
          <Box sx={{ px: 2.75, pt: 0.25, pb: 2.5 }}>
            {vigueur ? <>
              <Typography variant="h5" component="p" color={vigueur.prixSalleMoisCentimes == null ? "text.secondary" : "text.primary"} sx={{ overflowWrap: "anywhere" }}>{prixSalleAffiche(vigueur.prixSalleMoisCentimes)}</Typography>
              <Typography variant="body2" color="text.secondary">{prixInstallationAffiche(vigueur.prixInstallationCentimes)}</Typography>
              <Typography variant="body2" color={ancien ? "warning.main" : "text.secondary"} sx={{ mt: 0.5 }}>
                {ancienneteReleve(vigueur.releveLe, maintenant)}, le {date(vigueur.releveLe)}{ancien ? ". Plus d'un an : vérifiez-le." : ""}
              </Typography>
            </> : <>
              <Typography variant="h5" component="p" color="text.secondary">{PRIX_NON_RELEVE}</Typography>
              <Typography variant="body2" color="text.secondary">{peutModifier ? "Aucun relevé pour l'instant. Ajoutez le premier avec « Ajouter un relevé »." : "Aucun relevé pour l'instant. Un compte qui modifie Pilot peut en ajouter."}</Typography>
            </>}
          </Box>
        </Bloc>

        <Bloc titre="Son offre" icone={IconNotes} teinte="gris">
          <Stack spacing={1.5} sx={{ px: 2.75, pt: 0.25, pb: 2.5 }}>
            <Champ libelle="Offre" texte={concurrent.offre} absent="Non renseignée. Modifiez le concurrent pour décrire ce qu'il propose." />
            <Champ libelle="Notes" texte={concurrent.notes} absent="Aucune note." />
          </Stack>
        </Bloc>

        <Bloc titre="Relevés de prix" nombre={releves.length} icone={IconHistory} teinte="menthe"
          vide={releves.length ? undefined : "Aucun relevé. Chaque relevé garde un prix et sa date : le plus récent est celui en vigueur."}>
          {releves.map((r) => <Ligne key={r.id} data-releve={r.id}
            nom={<Stack direction="row" flexWrap="wrap" useFlexGap columnGap={1} rowGap={0.5} alignItems="center">
              <span>{date(r.releveLe)}</span>
              {r.enVigueur && <Chip size="small" color="primary" label="En vigueur" />}
            </Stack>}
            detail={<>
              <Box sx={{ color: r.prixSalleMoisCentimes == null ? "text.secondary" : "text.primary" }}>{prixSalleAffiche(r.prixSalleMoisCentimes)}</Box>
              <Box>{prixInstallationAffiche(r.prixInstallationCentimes)}</Box>
              <Box>{ancienneteReleve(r.releveLe, maintenant)}</Box>
              {r.conditions && <TexteReplie libelle="Conditions" texte={r.conditions} />}
              {r.source && <TexteReplie libelle="Source" texte={r.source} />}
            </>}>
            {peutModifier && <>
              <Button size="small" aria-label={`Modifier le relevé du ${date(r.releveLe)}`} onClick={() => setDialogue({ type: "releve", releve: r })}>Modifier</Button>
              <Button size="small" aria-label={`Supprimer le relevé du ${date(r.releveLe)}`} onClick={() => setDialogue({ type: "suppressionReleve", releve: r })}>Supprimer</Button>
            </>}
          </Ligne>)}
        </Bloc>
      </Stack>

      <Stack spacing={2.5} sx={{ minWidth: 0 }}>
        <Bloc titre="Établissements équipés" nombre={enPlace.length} icone={IconBuildingStore} teinte="bleu"
          vide={centresEquipes.length ? undefined : "Aucun établissement ne le désigne comme concurrent en place. Choisissez-le dans « Solution actuelle » de la fiche d'un prospect."}>
          {enPlace.length ? enPlace.map(ligneEtablissement)
            : <Typography variant="body2" color="text.secondary" sx={{ px: 2.75, pt: 0.25, pb: 1.5 }}>Aucun établissement ne l&apos;a encore en place.</Typography>}
          {passesChezLyrae.length > 0 && <>
            <Typography variant="body2" component="h3" fontWeight={600} color="text.secondary" sx={{ px: 2.75, pt: 2, pb: 0.75 }}>
              Passés chez Lyrae ({passesChezLyrae.length})
            </Typography>
            {passesChezLyrae.map(ligneEtablissement)}
          </>}
        </Bloc>

        <Bloc titre="Affaires perdues contre lui" nombre={affairesPerdues.length} icone={IconFlagOff} teinte="rouge"
          vide={affairesPerdues.length ? undefined : "Aucune affaire perdue contre ce concurrent. Elle apparaît ici quand un dossier sort en Perdu avec le motif Concurrent et le désigne dans « Contre qui ? »."}>
          {affairesPerdues.map((a) => <Ligne key={a.id} nom={<Box component={Link} href={`/pilot/organisations/${a.id}`} sx={{ overflowWrap: "anywhere" }}>{a.raisonSocialeNom}</Box>}
            detail={`${LIBELLES[a.etape]}${a.dateSortie ? ` depuis le ${date(a.dateSortie)}` : ""}`} />)}
        </Bloc>
      </Stack>
    </Box>

    {dialogue?.type === "concurrent" && <DialogueConcurrent concurrent={concurrent} fermer={() => setDialogue(null)} termine={termine} />}
    {dialogue?.type === "suppression" && <DialogueSuppressionConcurrent concurrent={concurrent} fermer={() => setDialogue(null)}
      termine={() => router.push("/pilot/concurrents")} />}
    {dialogue?.type === "releve" && <DialogueReleve concurrentId={concurrent.id} releve={dialogue.releve} fermer={() => setDialogue(null)} termine={termine} />}
    {dialogue?.type === "suppressionReleve" && <DialogueSuppressionReleve concurrentId={concurrent.id} releve={dialogue.releve} fermer={() => setDialogue(null)} termine={termine} />}
    <Snackbar open={message !== null} message={message} autoHideDuration={4000} onClose={() => setMessage(null)} />
  </Stack>;
}

/** Un champ de texte libre : replié au-delà de six lignes, le texte revient à la ligne, jamais de défilement horizontal. */
function Champ({ libelle, texte, absent }: { libelle: string; texte: string | null; absent: string }) {
  return <Box sx={{ minWidth: 0 }}>
    <Typography variant="caption" color="text.secondary" component="div">{libelle}</Typography>
    {texte ? <TexteReplie texte={texte} /> : <Typography color="text.secondary">{absent}</Typography>}
  </Box>;
}

function TexteReplie({ texte, libelle }: { texte: string; libelle?: string }) {
  const [ouvert, setOuvert] = useState(false);
  const long = texte.length > 280 || texte.split("\n").length > 6;
  const corps: ReactNode = <Typography component="span" sx={{ display: "block", whiteSpace: "pre-line", overflowWrap: "anywhere",
    ...(long && !ouvert ? { display: "-webkit-box", WebkitLineClamp: 6, WebkitBoxOrient: "vertical", overflow: "hidden" } : {}) }}>
    {libelle && <Box component="span" sx={{ color: "text.secondary" }}>{libelle} : </Box>}{texte}
  </Typography>;
  return <Box sx={{ minWidth: 0 }}>
    {corps}
    {long && <Button size="small" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)} sx={{ ml: -1 }}>{ouvert ? "Réduire" : "Tout afficher"}</Button>}
  </Box>;
}
