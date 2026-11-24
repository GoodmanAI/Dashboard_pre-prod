"use client";

import { useState } from "react";
import { Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { DialogueFormulaire, envoyer } from "@/pilot/components/formulaires/DialogueFormulaire";
import { ChampsOrganisation, valeursOrganisation, texte, nombreFacultatif, type CompteInterne, type CompteClient, type IdentiteOrganisation } from "@/pilot/components/formulaires/ChampsOrganisation";
import { ChampsContact, valeursContact, type ContactEditable } from "@/pilot/components/formulaires/ChampsContact";
import { creationContact, majContact } from "@/pilot/lib/validation/contact";
import { majOrganisation } from "@/pilot/lib/validation/organisation";
import { RechercheAnnuaire } from "@/pilot/components/formulaires/RechercheAnnuaire";
import { MODALITES, libelleModalite } from "@/pilot/lib/apports/referentiel";
import { creationCentre, majCentre, creationRattachement, majRattachement } from "@/pilot/lib/validation/centre";
import { creationVague, majVague } from "@/pilot/lib/validation/vague";
import type { CompteProduit } from "@/pilot/lib/referentiels";
import type { SuggestionsSaisie } from "@/pilot/lib/organisations/suggestions";
import type { Estimation } from "@/pilot/lib/integration/estimation";
import { AIDE_ADRESSE } from "@/pilot/lib/carte/affichage";

export type VagueFiche = { id: number; numero: number; nom: string | null; datePromise: string | null };
export type RattachementFiche = {
  vagueId: number | null; glissement: { reports: number; joursCumules: number; alerte: boolean };
  id: number; productId: number; produit: string; userProductId: number | null; email: string | null;
  datePromise: string | null; faites: number; total: number; bloquantes: number; estimation: Estimation;
};
export type SalleFiche = { id: number; libelle: string; modalite: string };
export type CentreFiche = { id: number; nom: string; codeSite: string | null; ville: string | null; adresse: string | null; codePostal: string | null;
  /** L'établissement (C-89) et ses salles, clé de facturation (C-90). */
  siret: string | null; finess: string | null; salles: SalleFiche[];
  rattachements: RattachementFiche[] };
export type Dialogue =
  | { type: "organisation" }
  /** Désigner le commercial ou le chef de projet, sans ouvrir toute la fiche (C-87). */
  | { type: "equipe"; role: "chefDeProjetId" | "responsableId" }
  | { type: "vague"; vague?: VagueFiche }
  | { type: "contact"; contact?: ContactEditable; principal?: boolean }
  | { type: "suppression"; contact: ContactEditable }
  | { type: "centre"; centre?: CentreFiche }
  | { type: "rattachement"; centre: CentreFiche }
  | { type: "date" | "compte"; rattachement: RattachementFiche }
  /** Les salles d'un centre (C-90). */
  | { type: "salles"; centre: CentreFiche }
  /** L'annuaire des entreprises (C-89). */
  | { type: "annuaire" };

export function DialoguesFiche({ dialogue, org, comptes, clients, suggestions, catalogue, comptesProduits, compteClientConnu, fermer, termine }: {
  dialogue: Dialogue; org: IdentiteOrganisation & { id: number; vagues: VagueFiche[] }; comptes: CompteInterne[]; clients: CompteClient[]; suggestions: SuggestionsSaisie;
  catalogue: { id: number; name: string }[]; comptesProduits: CompteProduit[]; compteClientConnu: boolean;
  fermer: () => void; termine: (message: string) => void;
}) {
  if (dialogue.type === "vague") {
    const vague = dialogue.vague;
    return <DialogueFormulaire titre={vague ? "Modifier la vague" : "Grouper en vague de mise en service"} fermer={fermer} soumettre={async (f) => {
      await envoyer(vague ? "/api/pilot/vagues/" + vague.id : "/api/pilot/vagues", vague ? "PATCH" : "POST", vague ? majVague : creationVague,
        { nom: texte(f, "nom"), datePromise: texte(f, "datePromise") || null, ...(!vague ? { organisationId: org.id } : {}) });
      termine(vague ? "Vague modifiée." : "Vague créée.");
    }}>
      <TextField autoFocus name="nom" label="Nom de la vague, facultatif" defaultValue={vague?.nom ?? ""} inputProps={{ maxLength: 200 }} />
      <TextField name="datePromise" label="Date promise" type="date" defaultValue={vague?.datePromise?.slice(0, 10) ?? ""} InputLabelProps={{ shrink: true }}
        helperText="Changer cette date la reporte sur tous les produits de la vague. Laissez vide pour l’effacer." />
    </DialogueFormulaire>;
  }
  if (dialogue.type === "organisation") return <DialogueFormulaire titre="Modifier l'organisation" fermer={fermer} soumettre={async (f) => {
    await envoyer(`/api/pilot/organisations/${org.id}`, "PATCH", majOrganisation, valeursOrganisation(f));
    termine("Organisation modifiée.");
  }}><ChampsOrganisation organisation={org} comptes={comptes} clients={clients} suggestions={suggestions} /></DialogueFormulaire>;

  if (dialogue.type === "equipe") {
    const chef = dialogue.role === "chefDeProjetId";
    return <DialogueFormulaire titre={chef ? "Désigner le chef de projet" : "Désigner le commercial"} bouton="Enregistrer" fermer={fermer} soumettre={async (f) => {
      const choix = texte(f, dialogue.role);
      await envoyer(`/api/pilot/organisations/${org.id}`, "PATCH", majOrganisation, { [dialogue.role]: choix ? Number(choix) : null });
      termine(chef ? (choix ? "Chef de projet désigné." : "Chef de projet retiré.") : "Commercial désigné.");
    }}>
      <TextField autoFocus name={dialogue.role} label={chef ? "Chef de projet" : "Commercial"} select fullWidth required={!chef} defaultValue={org[dialogue.role] ?? ""}
        SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}
        helperText={chef ? "Il suit la mise en service et reçoit les demandes qui le concernent." : undefined}>
        {chef ? <MenuItem value="">Non attribué</MenuItem> : <MenuItem value="">Choisir un commercial</MenuItem>}
        {comptes.map((c) => <MenuItem key={c.id} value={c.id}>{c.name ?? "Compte interne sans nom"}</MenuItem>)}
      </TextField>
    </DialogueFormulaire>;
  }

  if (dialogue.type === "annuaire") return <RechercheAnnuaire organisationId={org.id} nomInitial={org.raisonSocialeNom} fermer={fermer} termine={termine} />;

  if (dialogue.type === "salles") return <DialogueSalles centre={dialogue.centre} fermer={fermer} termine={termine} />;

  if (dialogue.type === "contact") {
    const contact = dialogue.contact;
    return <DialogueFormulaire titre={contact ? "Modifier le contact" : "Ajouter un contact"} bouton={contact ? "Enregistrer" : "Créer"} fermer={fermer} soumettre={async (f) => {
      await envoyer(contact ? `/api/pilot/contacts/${contact.id}` : "/api/pilot/contacts", contact ? "PATCH" : "POST",
        contact ? majContact : creationContact, { ...valeursContact(f), ...(!contact ? { organisationId: org.id } : {}) });
      termine(contact ? "Contact modifié." : "Contact ajouté.");
    }}><ChampsContact contact={contact} principal={dialogue.principal} metiers={suggestions.metier} /></DialogueFormulaire>;
  }
  if (dialogue.type === "suppression") return <DialogueFormulaire titre="Supprimer ce contact ?" bouton="Supprimer" suppression fermer={fermer} soumettre={async () => {
    await envoyer(`/api/pilot/contacts/${dialogue.contact.id}`, "DELETE");
    termine("Contact supprimé.");
  }}><Typography>Ses coordonnées seront effacées. Les échanges notés restent, sans nom de contact.</Typography></DialogueFormulaire>;

  if (dialogue.type === "centre") {
    const centre = dialogue.centre;
    return <DialogueFormulaire titre={centre ? "Modifier le centre" : "Ajouter un centre"} bouton={centre ? "Enregistrer" : "Créer"} fermer={fermer} soumettre={async (f) => {
      await envoyer(centre ? `/api/pilot/centres/${centre.id}` : "/api/pilot/centres", centre ? "PATCH" : "POST",
        centre ? majCentre : creationCentre, { nom: texte(f, "nom"), codeSite: texte(f, "codeSite"), ville: texte(f, "ville"),
          adresse: texte(f, "adresse"), codePostal: texte(f, "codePostal"), siret: texte(f, "siret"), finess: texte(f, "finess"), ...(!centre ? { organisationId: org.id } : {}) });
      termine(centre ? "Centre modifié." : "Centre créé.");
    }}>
      <TextField name="nom" label="Nom du centre" defaultValue={centre?.nom ?? ""} required autoFocus inputProps={{ maxLength: 200 }} />
      <TextField name="codeSite" label="Code site" defaultValue={centre?.codeSite ?? ""} inputProps={{ maxLength: 200 }} />
      <TextField name="adresse" label="Adresse" defaultValue={centre?.adresse ?? ""} inputProps={{ maxLength: 300 }} helperText={AIDE_ADRESSE} />
      <Stack direction="row" spacing={2}>
        <TextField name="codePostal" label="Code postal" defaultValue={centre?.codePostal ?? ""} inputProps={{ maxLength: 10, inputMode: "numeric" }} sx={{ width: 140, flexShrink: 0 }} />
        <TextField name="ville" label="Ville" defaultValue={centre?.ville ?? ""} inputProps={{ maxLength: 200 }} fullWidth />
      </Stack>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField name="siret" label="SIRET" defaultValue={centre?.siret ?? ""} inputProps={{ maxLength: 17, inputMode: "numeric" }} fullWidth />
        <TextField name="finess" label="FINESS" defaultValue={centre?.finess ?? ""} inputProps={{ maxLength: 200 }} fullWidth />
      </Stack>
    </DialogueFormulaire>;
  }
  if (dialogue.type === "rattachement") return <DialogueRattachement centre={dialogue.centre} catalogue={catalogue} comptes={comptesProduits} compteClientConnu={compteClientConnu} fermer={fermer} termine={termine} />;
  const rattachement = dialogue.rattachement;
  if (dialogue.type === "date") return <DialogueDate rattachement={rattachement} vagues={org.vagues} fermer={fermer} termine={termine} />;
  return <DialogueFormulaire titre="Compte Dashboard" fermer={fermer} soumettre={async (f) => {
    await envoyer("/api/pilot/rattachements/" + rattachement.id, "PATCH", majRattachement, { userProductId: nombreFacultatif(f, "userProductId") });
    termine("Compte Dashboard enregistré.");
  }}>
    <ChoixCompte comptes={comptesProduits.filter((c) => c.productId === rattachement.productId)} courant={rattachement} compteClientConnu={compteClientConnu} autoFocus />
  </DialogueFormulaire>;
}

function ChoixCompte({ comptes, courant, compteClientConnu, autoFocus = false }: {
  comptes: CompteProduit[]; courant?: RattachementFiche; compteClientConnu: boolean; autoFocus?: boolean;
}) {
  const aide = !compteClientConnu
    ? "Associez d'abord le compte Dashboard du client, avec le bouton Modifier de la fiche."
    : comptes.length || courant?.userProductId ? undefined : "Le compte du client n'a pas encore accès à ce produit au Dashboard.";
  return <TextField name="userProductId" label="Compte client sur le Dashboard" select fullWidth defaultValue={courant?.userProductId ?? ""} autoFocus={autoFocus} helperText={aide}>
    <MenuItem value="">Pas encore de compte sur le Dashboard</MenuItem>
    {courant?.userProductId && <MenuItem value={courant.userProductId}>{courant.email}</MenuItem>}
    {comptes.map((c) => <MenuItem key={c.id} value={c.id}>{c.email}</MenuItem>)}
  </TextField>;
}

function DialogueRattachement({ centre, catalogue, comptes, compteClientConnu, fermer, termine }: {
  centre: CentreFiche; catalogue: { id: number; name: string }[]; comptes: CompteProduit[]; compteClientConnu: boolean;
  fermer: () => void; termine: (message: string) => void;
}) {
  const disponibles = catalogue.filter((p) => !centre.rattachements.some((r) => r.productId === p.id));
  const [produitId, setProduitId] = useState(disponibles[0]?.id ?? "");
  return <DialogueFormulaire titre="Ajouter un produit" bouton="Créer" fermer={fermer} soumettre={async (f) => {
    await envoyer("/api/pilot/rattachements", "POST", creationRattachement, {
      centreId: centre.id, productId: Number(produitId), userProductId: nombreFacultatif(f, "userProductId"), datePromise: texte(f, "datePromise") || null,
    });
    termine("Produit rattaché.");
  }}>
    <TextField name="productId" label="Produit" select required autoFocus value={produitId} onChange={(e) => setProduitId(Number(e.target.value))}>
      {disponibles.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
    </TextField>
    <ChoixCompte key={produitId} comptes={comptes.filter((c) => c.productId === produitId)} compteClientConnu={compteClientConnu} />
    <TextField name="datePromise" label="Date promise" type="date" InputLabelProps={{ shrink: true }} />
  </DialogueFormulaire>;
}

function DialogueDate({ rattachement, vagues, fermer, termine }: {
  rattachement: RattachementFiche; vagues: VagueFiche[]; fermer: () => void; termine: (message: string) => void;
}) {
  const [datePromise, setDatePromise] = useState(rattachement.datePromise?.slice(0, 10) ?? "");
  const [vagueId, setVagueId] = useState(rattachement.vagueId ?? "");
  return <DialogueFormulaire titre="Date promise" fermer={fermer} soumettre={async () => {
    await envoyer("/api/pilot/rattachements/" + rattachement.id, "PATCH", majRattachement,
      { datePromise: datePromise || null, ...(vagues.length ? { vagueId: vagueId === "" ? null : Number(vagueId) } : {}) });
    termine("Date promise enregistrée.");
  }}>
    <TextField name="datePromise" label="Date promise" type="date" autoFocus value={datePromise} onChange={(e) => setDatePromise(e.target.value)}
      InputLabelProps={{ shrink: true }} helperText="Laissez vide pour effacer la date." />
    {vagues.length > 0 && <TextField select label="Vague" value={vagueId} onChange={(e) => {
      const id = e.target.value === "" ? "" : Number(e.target.value);
      setVagueId(id);
      const vague = vagues.find((v) => v.id === id);
      if (id !== rattachement.vagueId && vague?.datePromise) setDatePromise(vague.datePromise.slice(0, 10));
    }} helperText="Entrer dans une vague reprend sa date promise. Vous pourrez ensuite modifier la date de ce site.">
      <MenuItem value="">Sans vague</MenuItem>
      {vagues.map((v) => <MenuItem key={v.id} value={v.id}>Vague {v.numero}{v.nom ? " · " + v.nom : ""}</MenuItem>)}
    </TextField>}
  </DialogueFormulaire>;
}

/**
 * Les salles d'un centre (C-90) : la clé de facturation d'un abonnement par
 * salle. Les mêmes salles que l'apport d'affaires et le préremplissage des
 * propositions : une seule saisie, lue partout.
 */
function DialogueSalles({ centre, fermer, termine }: { centre: CentreFiche; fermer: () => void; termine: (message: string) => void }) {
  const [salles, setSalles] = useState(centre.salles);
  const [erreur, setErreur] = useState<string | null>(null);
  const [change, setChange] = useState(false);
  const retirer = async (id: number) => {
    setErreur(null);
    try { await envoyer(`/api/pilot/apports/salles/${id}`, "DELETE"); setSalles((s) => s.filter((x) => x.id !== id)); setChange(true); }
    catch (e) { setErreur((e as Error).message); }
  };
  return <DialogueFormulaire titre={`Salles de ${centre.nom}`} bouton="Ajouter" fermer={() => change ? termine("Salles mises à jour.") : fermer()} soumettre={async (f) => {
    const nombre = Number(texte(f, "nombre"));
    await envoyer(`/api/pilot/apports/sites/${centre.id}`, "PATCH", undefined, { action: "ajouterSalles", nombre, modalite: texte(f, "modalite") });
    termine(`${nombre} salle${nombre > 1 ? "s" : ""} ajoutée${nombre > 1 ? "s" : ""}.`);
  }}>
    {erreur && <Typography color="error">{erreur}</Typography>}
    {salles.length ? <Stack spacing={0.5}>
      {salles.map((s) => <Stack key={s.id} direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
        <Typography>{s.libelle} · {libelleModalite(s.modalite)}</Typography>
        <Button size="small" color="error" aria-label={`Retirer ${s.libelle}`} onClick={() => retirer(s.id)}>Retirer</Button>
      </Stack>)}
    </Stack> : <Typography color="text.secondary">Aucune salle saisie. L&apos;abonnement par salle ne peut pas se calculer pour ce centre.</Typography>}
    <Typography sx={{ fontWeight: 600, pt: 1 }}>Ajouter des salles</Typography>
    <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
      <TextField name="nombre" label="Nombre" type="number" defaultValue={1} required inputProps={{ min: 1, max: 99, step: 1 }} sx={{ width: { sm: 120 } }} />
      <TextField name="modalite" label="Modalité" select defaultValue="RX" required fullWidth>
        {MODALITES.map((m) => <MenuItem key={m.code} value={m.code}>{m.libelle}</MenuItem>)}
      </TextField>
    </Stack>
    <Typography variant="caption" color="text.secondary">Le prix d&apos;une salle est le même quelle que soit la modalité. La modalité sert au suivi des équipements.</Typography>
  </DialogueFormulaire>;
}
