"use client";

import { useMemo, useState } from "react";
import { Alert, Autocomplete, Box, Button, MenuItem, Stack, TextField, Typography, createFilterOptions } from "@mui/material";
import type { CrmTypeConcurrent } from "@prisma/client";
import { cleDeNom, LIBELLES_TYPE_CONCURRENT, nettoyerNom } from "@/pilot/lib/concurrents/regles";
import type { OptionConcurrent } from "@/pilot/lib/concurrents/options";
import { JETONS } from "@/pilot/jetons";
import { envoyer } from "./DialogueFormulaire";

type Option = OptionConcurrent | { creer: string };
const estCreation = (o: Option): o is { creer: string } => "creer" in o;

const filtre = createFilterOptions<Option>({ stringify: (o) => estCreation(o) ? o.creer : `${o.nom} ${LIBELLES_TYPE_CONCURRENT[o.type]}` });

/**
 * Choisir un concurrent dans la liste lue une fois au rendu de la page, ou en
 * créer un à la volée : « Créer « x » » ouvre le nom et le type sous le champ, et
 * le concurrent est créé sans quitter la fiche. Facultatif : le champ s'efface.
 * Le texte tapé ne part jamais dans une adresse, seulement dans la création.
 *
 * Le panneau de création n'est pas un second formulaire : le sélecteur vit
 * souvent dans un formulaire, et un formulaire dans un formulaire enverrait les deux.
 */
export function SelecteurConcurrent({ concurrents, valeur, changer, libelle = "Lequel ?", aide, disabled = false, autoFocus = false, typeParDefaut = "AUTRE" }: {
  concurrents: OptionConcurrent[]; valeur: number | null; changer: (id: number | null) => void;
  libelle?: string; aide?: string; disabled?: boolean; autoFocus?: boolean; typeParDefaut?: CrmTypeConcurrent;
}) {
  // Les concurrents créés ici sont proposés tout de suite, sans attendre la relecture de la page.
  const [crees, setCrees] = useState<OptionConcurrent[]>([]);
  const liste = useMemo(() => [...concurrents, ...crees.filter((c) => !concurrents.some((x) => x.id === c.id))].sort((a, b) => a.nom.localeCompare(b.nom, "fr")), [concurrents, crees]);
  const [creation, setCreation] = useState<{ nom: string; type: CrmTypeConcurrent } | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const choisi = liste.find((c) => c.id === valeur) ?? null;

  async function creer() {
    if (!creation || envoi) return;
    setEnvoi(true); setErreur(null);
    try {
      const { concurrent } = await envoyer<{ concurrent: OptionConcurrent }>("/api/pilot/concurrents", "POST", undefined, { nom: creation.nom, type: creation.type });
      setCrees((c) => [...c, { id: concurrent.id, nom: concurrent.nom, type: concurrent.type }]);
      setCreation(null);
      changer(concurrent.id);
    } catch (e) { setErreur(e instanceof Error ? e.message : "La création a échoué."); }
    finally { setEnvoi(false); }
  }

  return <Stack spacing={1.5}>
    <Autocomplete<Option, false, false, false> options={liste} value={choisi} disabled={disabled || envoi}
      onChange={(_, o) => { setErreur(null); if (!o) changer(null); else if (estCreation(o)) setCreation({ nom: o.creer, type: typeParDefaut }); else { setCreation(null); changer(o.id); } }}
      filterOptions={(options, etat) => {
        const trouves = filtre(options, etat);
        const saisie = nettoyerNom(etat.inputValue);
        if (saisie && !options.some((o) => !estCreation(o) && cleDeNom(o.nom) === cleDeNom(saisie))) trouves.push({ creer: saisie });
        return trouves;
      }}
      getOptionLabel={(o) => estCreation(o) ? o.creer : o.nom}
      isOptionEqualToValue={(a, b) => !estCreation(a) && !estCreation(b) && a.id === b.id}
      renderOption={(props, o) => <Box component="li" {...props} key={estCreation(o) ? "creer" : o.id}>
        {estCreation(o) ? <Typography fontWeight={500} color="primary" sx={{ overflowWrap: "anywhere" }}>Créer « {o.creer} »</Typography>
          : <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ overflowWrap: "anywhere" }}>{o.nom}</Typography>
            <Typography variant="caption" color="text.secondary">{LIBELLES_TYPE_CONCURRENT[o.type]}</Typography>
          </Box>}
      </Box>}
      noOptionsText="Aucun concurrent. Saisissez un nom pour le créer."
      clearText="Effacer" openText="Ouvrir la liste" closeText="Fermer la liste"
      renderInput={(parametres) => <TextField {...parametres} label={libelle} autoFocus={autoFocus} fullWidth
        helperText={aide ?? "Choisissez dans la liste ou saisissez un nom pour le créer."} inputProps={{ ...parametres.inputProps, maxLength: 120 }} />} />
    {creation && <Stack role="group" aria-label="Nouveau concurrent" spacing={1.5} sx={{ p: 2, borderRadius: "14px", bgcolor: JETONS.surface }}>
      <Typography variant="body2" fontWeight={600}>Nouveau concurrent</Typography>
      {erreur && <Alert severity="error" icon={false}>{erreur}</Alert>}
      <TextField label="Nom" value={creation.nom} autoFocus required fullWidth inputProps={{ maxLength: 120 }}
        onChange={(e) => setCreation({ ...creation, nom: e.target.value })}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); void creer(); } }} />
      <TextField label="Type" select value={creation.type} fullWidth onChange={(e) => setCreation({ ...creation, type: e.target.value as CrmTypeConcurrent })}>
        {Object.entries(LIBELLES_TYPE_CONCURRENT).map(([id, nom]) => <MenuItem key={id} value={id}>{nom}</MenuItem>)}
      </TextField>
      <Stack direction="row" flexWrap="wrap" useFlexGap gap={1} justifyContent="flex-end">
        <Button onClick={() => { setCreation(null); setErreur(null); }}>Annuler</Button>
        <Button variant="outlined" disabled={envoi || !nettoyerNom(creation.nom)} onClick={() => void creer()}>Créer le concurrent</Button>
      </Stack>
    </Stack>}
  </Stack>;
}
