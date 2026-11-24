"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import L from "leaflet";
import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import { euros } from "@/pilot/lib/argent";
import { JETONS } from "@/pilot/jetons";
import { PastilleTemperature } from "@/pilot/components/PastilleTemperature";
import { LIBELLES } from "@/pilot/lib/pipeline";
import {
  COTE_MARQUEUR, VUE_PAR_DEFAUT, dateCourte, htmlMarqueur, largeursBulle, lienFiche, limites, nomMarqueur, styleMarqueur,
  type CentreCarte, type ConcurrentCarte, type FiltresCarte,
} from "@/pilot/lib/carte/affichage";

/**
 * La carte (lot U, C-80). Chargée côté navigateur seulement : Leaflet lit `window`.
 * Leaflet est utilisé directement (licence BSD-2), sans surcouche React : la carte,
 * ses tuiles, ses marqueurs et sa bulle sont créés dans des effets, et tout est
 * défait au démontage (`map.remove()`, observateur coupé, portail retiré par React).
 *
 * Elle ne reçoit que des centres déjà localisés par le serveur : aucune adresse
 * ne part d'ici vers un service, la seule requête du navigateur est celle des tuiles.
 *
 * Les tuiles viennent d'OpenStreetMap. Sa politique d'usage exige un en-tête
 * `Referer` et interdit de le supprimer ; Pilot envoie `Referrer-Policy:
 * same-origin`, qui n'en laisserait partir aucun vers un autre site. La couche le
 * rétablit pour ses seules tuiles (`referrerPolicy`, posé sur chaque image) : seule
 * l'origine de Pilot part, jamais le chemin. L'attribution reste affichée en
 * permanence, avec son lien vers la licence.
 *
 * La bulle est rendue par un portail React dans le contenu de la bulle Leaflet :
 * les noms restent du texte échappé par React, jamais une chaîne HTML. Les
 * marqueurs, eux, sont du HTML fait des seuls jetons (`htmlMarqueur`).
 *
 * Clavier : chaque marqueur est focalisable (`keyboard`, rôle bouton) et porte un
 * `aria-label` qui dit ce que dit sa couleur ; Entrée ou Espace ouvre la bulle,
 * Échap la ferme et rend le focus au marqueur.
 */
const TUILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">les contributeurs d\'OpenStreetMap</a>';
const ZOOM_MAX = 18;

function Bulle({ c, concurrents }: { c: CentreCarte; concurrents: readonly ConcurrentCarte[] }) {
  const concurrent = c.concurrentId === null ? null : concurrents.find((x) => x.id === c.concurrentId)?.nom ?? null;
  const perdu = c.genre === "PERDU";
  return <Stack spacing={1} sx={{ minWidth: 0 }}>
    <Box sx={{ minWidth: 0 }}>
      <Typography component="div" sx={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3, overflowWrap: "anywhere" }}>{c.organisation}</Typography>
      <Typography component="div" sx={{ fontSize: 13, color: "text.secondary", overflowWrap: "anywhere" }}>{c.centre}{c.ville ? `, ${c.ville}` : ""}</Typography>
    </Box>
    <Stack direction="row" flexWrap="wrap" useFlexGap gap={0.75} alignItems="center">
      <Chip size="small" label={LIBELLES[c.etape]} />
      {c.temperature && <PastilleTemperature valeur={{ niveau: c.temperature, forcee: c.temperatureForcee }} />}
    </Stack>
    {perdu
      ? <>
        <Typography component="div" sx={{ fontSize: 13, fontWeight: 600, overflowWrap: "anywhere" }}>Perdu contre {concurrent ?? "un concurrent"}</Typography>
        {c.dateSortie && <Typography component="div" sx={{ fontSize: 13 }}><Box component="span" sx={{ color: "text.secondary" }}>Sorti le </Box>{dateCourte(c.dateSortie)}</Typography>}
      </>
      : <>
        <Typography component="div" sx={{ fontSize: 13 }}>
          <Box component="span" sx={{ color: "text.secondary" }}>Montant du dossier : </Box>
          {c.montant === null
            ? <Box component="span" sx={{ color: "text.secondary" }}>pas encore estimé</Box>
            : c.montant.centimes === null
              ? <Box component="span">contrat en brouillon</Box>
              : <Box component="span" sx={{ fontWeight: 600 }}>{euros(c.montant.centimes)} / mois <Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}>· {c.montant.libelle}</Box></Box>}
        </Typography>
        {concurrent && <Typography component="div" sx={{ fontSize: 13, overflowWrap: "anywhere" }}><Box component="span" sx={{ color: "text.secondary" }}>Concurrent en place : </Box>{concurrent}</Typography>}
      </>}
    {c.responsable && <Typography component="div" sx={{ fontSize: 13, overflowWrap: "anywhere" }}><Box component="span" sx={{ color: "text.secondary" }}>Commercial : </Box>{c.responsable}</Typography>}
    {c.statut === "AMBIGU" && <Typography component="div" sx={{ fontSize: 13, color: "warning.main", fontWeight: 600 }}>Position à vérifier</Typography>}
    <Button variant="contained" size="small" component={Link} href={lienFiche(c.organisationId)} sx={{ alignSelf: "flex-start" }}>Ouvrir la fiche</Button>
  </Stack>;
}

type Instances = { carte: L.Map; bulle: L.Popup; contenu: HTMLDivElement; marqueurs: L.LayerGroup };

export default function CarteLeaflet({ affiches, filtres, concurrents }: { affiches: CentreCarte[]; filtres: FiltresCarte; concurrents: ConcurrentCarte[] }) {
  const conteneurRef = useRef<HTMLDivElement>(null);
  const [instances, setInstances] = useState<Instances | null>(null);
  /**
   * Le centre dont la bulle est ouverte. Un objet neuf à chaque demande : un clic
   * ferme d'abord la bulle (Leaflet), puis la rouvre, même sur le même marqueur.
   */
  const [ouvert, setOuvert] = useState<{ id: number } | null>(null);
  const marqueursParId = useRef(new Map<number, L.Marker>());
  /** Le marqueur de la bulle ouverte : Échap lui rend le focus. */
  const marqueurOuvert = useRef<L.Marker | null>(null);
  const bornes = useMemo(() => limites(affiches), [affiches]);
  const centreOuvert = ouvert === null ? null : affiches.find((c) => c.id === ouvert.id) ?? null;

  // La carte, une fois : tuiles, zoom en français, bulle partagée, couche des marqueurs, suivi de la taille.
  useEffect(() => {
    const conteneur = conteneurRef.current;
    if (!conteneur) return;
    const carte = L.map(conteneur, { center: VUE_PAR_DEFAUT.centre, zoom: VUE_PAR_DEFAUT.zoom, maxZoom: ZOOM_MAX, zoomControl: false });
    L.tileLayer(TUILES, { maxZoom: ZOOM_MAX, attribution: ATTRIBUTION, referrerPolicy: "strict-origin-when-cross-origin" }).addTo(carte);
    L.control.zoom({ position: "topleft", zoomInTitle: "Zoomer", zoomOutTitle: "Dézoomer" }).addTo(carte);
    const contenu = document.createElement("div");
    const bulle = L.popup({ ...largeursBulle(conteneur.clientWidth), autoPanPadding: [16, 16], closeButton: true });
    const marqueurs = L.layerGroup().addTo(carte);
    carte.on("popupopen", (e: L.PopupEvent) => {
      e.popup.getElement()?.querySelector(".leaflet-popup-close-button")?.setAttribute("aria-label", "Fermer la bulle");
    });
    carte.on("popupclose", () => setOuvert(null));
    // Échap ferme la bulle où que soit le focus dans la carte, et rend le focus au marqueur.
    const echap = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !carte.hasLayer(bulle)) return;
      const marqueur = marqueurOuvert.current;
      carte.closePopup(bulle);
      e.stopPropagation();
      marqueur?.getElement()?.focus();
    };
    conteneur.addEventListener("keydown", echap);
    // Un panneau qui s'ouvre au-dessus de la carte change sa taille : Leaflet relit la sienne, la bulle suit la largeur.
    const observateur = new ResizeObserver(() => {
      carte.invalidateSize();
      Object.assign(bulle.options, largeursBulle(conteneur.clientWidth));
      if (carte.hasLayer(bulle)) bulle.update();
    });
    observateur.observe(conteneur);
    setInstances({ carte, bulle, contenu, marqueurs });
    return () => {
      observateur.disconnect();
      conteneur.removeEventListener("keydown", echap);
      carte.off();
      carte.remove();
      setInstances(null);
      setOuvert(null);
    };
  }, []);

  // Les marqueurs : une icône par style, pas une par centre ; aucune image (les icônes par défaut cassent avec le bundler).
  // Avant l'effet de la bulle, dans le même passage : elle retrouve le marqueur neuf de son centre.
  useLayoutEffect(() => {
    if (!instances) return;
    const { marqueurs } = instances;
    const icones = new Map<string, L.DivIcon>();
    const parId = new Map<number, L.Marker>();
    for (const c of affiches) {
      const s = styleMarqueur(c, filtres);
      const cle = `${s.point}${s.bord}${s.forme}${s.pointille}`;
      let icone = icones.get(cle);
      if (!icone) icones.set(cle, icone = L.divIcon({ html: htmlMarqueur(s), className: "carte-marqueur", iconSize: [COTE_MARQUEUR, COTE_MARQUEUR], iconAnchor: [COTE_MARQUEUR / 2, COTE_MARQUEUR / 2] }));
      const nom = `${c.organisation}, ${c.centre}. ${nomMarqueur(c, filtres, concurrents)}${c.statut === "AMBIGU" ? ". Position à vérifier" : ""}`;
      const marqueur = L.marker([Number(c.latitude), Number(c.longitude)], { icon: icone, title: nom, keyboard: true, riseOnHover: true });
      marqueur.on("add", () => marqueur.getElement()?.setAttribute("aria-label", nom));
      marqueur.on("click", () => setOuvert({ id: c.id }));
      marqueur.on("keydown", (e: L.LeafletKeyboardEvent) => {
        if (e.originalEvent.key !== "Enter" && e.originalEvent.key !== " ") return;
        e.originalEvent.preventDefault();
        setOuvert({ id: c.id });
      });
      marqueurs.addLayer(marqueur);
      parId.set(c.id, marqueur);
    }
    marqueursParId.current = parId;
    return () => { marqueurs.clearLayers(); marqueursParId.current = new Map(); };
  }, [instances, affiches, filtres, concurrents]);

  // La bulle suit le centre ouvert. Le portail a déjà rendu son contenu quand cet effet tourne : Leaflet mesure la bonne taille.
  useLayoutEffect(() => {
    if (!instances) return;
    const { carte, bulle, contenu } = instances;
    const marqueur = centreOuvert ? marqueursParId.current.get(centreOuvert.id) : undefined;
    marqueurOuvert.current = marqueur ?? null;
    if (!centreOuvert || !marqueur) {
      // Le centre a quitté le périmètre (filtre) : sa bulle se ferme.
      if (carte.hasLayer(bulle)) carte.closePopup(bulle);
      return;
    }
    bulle.options.offset = L.point(0, -COTE_MARQUEUR / 2 - 4);
    bulle.setLatLng(marqueur.getLatLng());
    if (bulle.getContent() !== contenu) bulle.setContent(contenu);
    if (carte.hasLayer(bulle)) bulle.update(); else bulle.openOn(carte);
  }, [instances, ouvert, centreOuvert, affiches, filtres, concurrents]);

  // Recadre sur les centres affichés quand le périmètre change, pas quand on ouvre une bulle.
  useEffect(() => {
    if (!instances) return;
    if (bornes) instances.carte.fitBounds(bornes, { padding: [48, 48], maxZoom: 14, animate: false });
    else instances.carte.setView(VUE_PAR_DEFAUT.centre, VUE_PAR_DEFAUT.zoom, { animate: false });
  }, [instances, bornes]);

  return <Box sx={{
    position: "absolute", inset: 0,
    "& .leaflet-container": { width: "100%", height: "100%", fontFamily: "inherit", fontSize: 14, bgcolor: JETONS.gris },
    // Les liens de Leaflet colorent tout `a` du conteneur : le bouton de la bulle garde son texte blanc.
    "& .leaflet-container a.MuiButton-contained": { color: "primary.contrastText" },
    "& .leaflet-container a.MuiButton-contained:hover": { color: "primary.contrastText" },
    "& .leaflet-popup-content-wrapper": { borderRadius: "14px", boxShadow: JETONS.ombreFlottante, color: JETONS.encre },
    "& .leaflet-popup-content": { margin: "14px 16px", lineHeight: 1.4 },
    "& .leaflet-container a.leaflet-popup-close-button": { top: 6, right: 6, width: 28, height: 28, fontSize: 22, lineHeight: "26px", color: JETONS.secondaire },
    "& .leaflet-bar": { border: 0, borderRadius: "12px", boxShadow: JETONS.ombreIlot, overflow: "hidden" },
    "& .leaflet-bar a": { width: 36, height: 36, lineHeight: "36px", color: JETONS.encre, borderBottomColor: JETONS.filetVerre },
    "& .leaflet-control-attribution": { fontSize: 11, maxWidth: "100%" },
    "& .carte-marqueur": { background: "none", border: 0 },
    "& .leaflet-marker-icon:focus-visible": { outline: `3px solid ${JETONS.accent}`, outlineOffset: 4, borderRadius: "50%" },
  }}>
    <div ref={conteneurRef} style={{ width: "100%", height: "100%" }} />
    {instances && centreOuvert && createPortal(<Bulle c={centreOuvert} concurrents={concurrents} />, instances.contenu)}
  </Box>;
}
