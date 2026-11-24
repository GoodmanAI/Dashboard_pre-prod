"use client";

import { IconHistory } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Typography } from "@mui/material";
import { Bloc, Ligne } from "@/pilot/components/Bloc";
import { DialogueFormulaire } from "@/pilot/components/formulaires/DialogueFormulaire";

type Evenement = { id: number; resume: string; organisationId: number | null; surveneuLe: string };
export function Nouveautes({ utilisateurId }: { utilisateurId: number }) {
  const [evenements, setEvenements] = useState<Evenement[]>([]);
  const [tout, setTout] = useState(false);
  const [erreur, setErreur] = useState(false);
  const [essai, setEssai] = useState(0);
  const [depuisLu, setDepuisLu] = useState<string | null>(null);
  const [curseur, setCurseur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreurSuite, setErreurSuite] = useState(false);
  const cle = `pilot:derniereVisite:${utilisateurId}`;
  useEffect(() => {
    let actif = true;
    let depuis: string | null;
    try {
      depuis = localStorage.getItem(cle);
      if (!depuis || !Number.isFinite(Date.parse(depuis))) { localStorage.setItem(cle, new Date().toISOString()); return; }
    } catch { return; }
    fetch(`/api/pilot/evenements?depuis=${encodeURIComponent(depuis)}&moi=1`)
      .then(async (r) => { if (!r.ok) throw new Error(); return r.json() as Promise<{ evenements: Evenement[]; curseur: string | null }>; })
      .then((r) => { if (actif) { setEvenements(r.evenements); setCurseur(r.curseur); setDepuisLu(depuis); setErreur(false); } })
      .catch(() => { if (actif) setErreur(true); });
    return () => { actif = false; };
  }, [cle, essai]);
  function vu() {
    try { localStorage.setItem(cle, new Date().toISOString()); } catch { /* Navigation privée : masquer pour cette visite. */ }
    setEvenements([]); setTout(false);
  }
  async function chargerSuite() {
    if (!depuisLu || !curseur || chargement) return;
    setChargement(true); setErreurSuite(false);
    try {
      const params = new URLSearchParams({ depuis: depuisLu, moi: "1", avant: curseur });
      const r = await fetch(`/api/pilot/evenements?${params}`);
      if (!r.ok) throw new Error();
      const page: { evenements: Evenement[]; curseur: string | null } = await r.json();
      setEvenements((precedents) => [...precedents, ...page.evenements]); setCurseur(page.curseur);
    } catch { setErreurSuite(true); }
    finally { setChargement(false); }
  }
  if (erreur) return <Bloc icone={IconHistory} teinte="gris" titre="Depuis votre dernière visite" vide={<>Les nouveautés n&apos;ont pas pu être chargées. <Button size="small" onClick={() => setEssai((v) => v + 1)}>Réessayer</Button></>} />;
  if (!evenements.length) return null;
  function lignes(liste: Evenement[]) {
    return liste.map((e) => <Ligne key={e.id} nom={<Typography variant="body2" fontWeight={500}>{e.resume}</Typography>}>
      {e.organisationId && <Button component={Link} href={`/pilot/organisations/${e.organisationId}?onglet=chronologie`} variant="outlined">Ouvrir</Button>}
    </Ligne>);
  }
  return <Bloc icone={IconHistory} teinte="gris" titre="Depuis votre dernière visite" nombre={evenements.length} entete={<>
    {evenements.length > 5 && <Button size="small" onClick={() => setTout(true)}>Tout voir</Button>}
    <Button size="small" onClick={vu}>Vu</Button>
  </>}>
    {lignes(evenements.slice(0, 5))}
    {tout && <DialogueFormulaire titre="Depuis votre dernière visite" fermer={() => setTout(false)} bouton="Vu" soumettre={async () => vu()}>
      {lignes(evenements)}
      {erreurSuite && <Typography variant="body2" color="error.main">La suite n&apos;a pas pu être chargée. Réessayez.</Typography>}
      {curseur && <Button onClick={() => void chargerSuite()} disabled={chargement}>Afficher les plus anciens</Button>}
    </DialogueFormulaire>}
  </Bloc>;
}
