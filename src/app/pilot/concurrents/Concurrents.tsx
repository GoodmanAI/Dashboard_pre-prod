"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Box, Button, Chip, Snackbar, Stack, Typography } from "@mui/material";
import { IconSwords } from "@tabler/icons-react";
import { Bloc, EnTete, Ligne } from "@/pilot/components/Bloc";
import { LIBELLES_TYPE_CONCURRENT } from "@/pilot/lib/concurrents/regles";
import { releveAncien, resumePrix } from "@/pilot/lib/concurrents/affichage";
import { compter } from "@/pilot/lib/texte";
import { DialogueConcurrent } from "./DialoguesConcurrent";
import type { LigneConcurrent } from "./types";

/** La liste des concurrents : le nom, le type, le prix repère en vigueur avec son âge, et où ils sont en place. */
export function Concurrents({ concurrents, peutModifier }: { concurrents: LigneConcurrent[]; peutModifier: boolean }) {
  const router = useRouter();
  const [creation, setCreation] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const maintenant = new Date();
  return <Stack spacing={2.5}>
    <EnTete titre="Concurrents" sousTitre="Ce que l'équipe sait des solutions concurrentes : leur prix, leur offre et les établissements où elles sont en place.">
      {peutModifier && <Button variant="contained" onClick={() => setCreation(true)}>Nouveau concurrent</Button>}
    </EnTete>
    <Bloc titre="Concurrents connus" nombre={concurrents.length} icone={IconSwords} teinte="rose"
      vide={concurrents.length ? undefined : peutModifier
        ? "Aucun concurrent pour l'instant. Créez le premier avec « Nouveau concurrent », ou depuis la fiche d'un prospect qui utilise déjà une autre solution."
        : "Aucun concurrent pour l'instant. Un compte qui modifie Pilot peut en créer."}>
      {concurrents.map((c) => {
        const prix = resumePrix(c.enVigueur, maintenant);
        const ancien = c.enVigueur ? releveAncien(c.enVigueur.releveLe, maintenant) : false;
        return <Ligne key={c.id} data-concurrent={c.id}
          nom={<Stack direction="row" flexWrap="wrap" useFlexGap columnGap={1} rowGap={0.5} alignItems="center">
            <Box component={Link} href={`/pilot/concurrents/${c.id}`} sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>{c.nom}</Box>
            <Chip size="small" label={LIBELLES_TYPE_CONCURRENT[c.type]} />
          </Stack>}
          detail={<>
            {c.centresEquipes > 0 ? `En place chez ${compter(c.centresEquipes, "établissement")}` : "En place chez aucun établissement connu"}
            {c.affairesPerdues > 0 && ` · ${compter(c.affairesPerdues, "affaire perdue", "affaires perdues")} contre lui`}
          </>}
          date={<>
            <Typography component="div" variant="body2" fontWeight={500} color={c.enVigueur?.prixSalleMoisCentimes != null ? "text.primary" : "text.secondary"}>{prix.prix}</Typography>
            {prix.anciennete ? <Typography component="div" variant="caption" color={ancien ? "warning.main" : "text.secondary"}>{prix.anciennete}{ancien ? ", à vérifier" : ""}</Typography>
              : <Typography component="div" variant="caption" color="text.secondary">Ajoutez un relevé dans sa fiche</Typography>}
          </>} />;
      })}
    </Bloc>
    {creation && <DialogueConcurrent fermer={() => setCreation(false)} termine={(texte) => { setCreation(false); setMessage(texte); router.refresh(); }} />}
    <Snackbar open={message !== null} message={message} autoHideDuration={4000} onClose={() => setMessage(null)} />
  </Stack>;
}
