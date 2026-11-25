"use client";

import { useState } from "react";
import { RubriqueContexte } from "./rubrique";
import Link from "next/link";
import { Recherche } from "./Recherche";
import { Tuile } from "./Tuile";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import Alert from "@mui/material/Alert";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import { IconLifebuoy,
  IconBell,
  IconBriefcase,
  IconChartLine,
  IconDots,
  IconFileCertificate,
  IconHeartbeat,
  IconHourglass,
  IconLogout,
  IconSend,
  IconUserCircle,
  IconNavigation,
  IconRocket,
  IconSun,
  IconPlugConnected, IconUsersGroup, IconHeartHandshake, IconUserShield, IconSwords, IconTag, IconMap2,
  IconListDetails, IconReceipt, IconServer2,
} from "@tabler/icons-react";
import { JETONS, type Teinte } from "@/pilot/jetons";
import { chiffrePastille, phrasePourVous, type ComptePourVous } from "@/pilot/lib/commentaires/affichage";
import { useComptePourVous } from "./useComptePourVous";
import NotificationBell from "@/components/notifications/NotificationBell";
import BasculeEspace from "@/components/espaces/BasculeEspace";

/**
 * La coquille, à la manière de Réglages Système (CHOIX.md, C-53 puis C-54) :
 * barre latérale translucide, une tuile de couleur par écran, la sélection en
 * bleu plein. Sous 900 px la barre ne garde que ses tuiles ; sous 600 px elle
 * laisse place à une barre d'onglets en bas, comme sur iPhone.
 */
const LARGEUR_MENU = { sm: 76, md: 256 };
const HAUTEUR_BARRE = 56;
const HAUTEUR_ONGLETS = 64;
const FILET = `1px solid ${JETONS.filetVerre}`;
/** Liquid Glass, approximation web : verre clair, reflet en haut, ombre douce. Réservé aux commandes, jamais au contenu. */
const ILOT = { bgcolor: JETONS.verreIlot, backdropFilter: "blur(24px) saturate(180%)", WebkitBackdropFilter: "blur(24px) saturate(180%)", boxShadow: JETONS.ombreIlot };
const VERRE_LEGER = { backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" };

/** `exige` : l'entrée ne s'affiche que pour un compte qui a ce droit (C-64). Le serveur garde de toute façon la page. */
type Entree = { href: string; libelle: string; Icone: typeof IconSun; teinte: Teinte; groupe: "quotidien" | "pilotage"; onglet: boolean; exige?: "voirCa" | "superAdmin" };

// Les noms viennent de docs/VOCABULAIRE.md.
const ENTREES: Entree[] = [
  { href: "/pilot", libelle: "Aujourd'hui", Icone: IconSun, teinte: "orange", groupe: "quotidien", onglet: true },
  { href: "/pilot/pipeline", libelle: "Prospects", Icone: IconBriefcase, teinte: "bleu", groupe: "quotidien", onglet: true },
  // Ce qui a été vendu : dates clés, produits et tarifs des clients signés (C-62).
  { href: "/pilot/ventes", libelle: "Ventes", Icone: IconFileCertificate, teinte: "menthe", groupe: "quotidien", onglet: true },
  // Sous 600 px, quatre onglets au plus (HIG) : la mise en service passe sous « Plus ».
  { href: "/pilot/integrations", libelle: "Déploiement", Icone: IconRocket, teinte: "vert", groupe: "quotidien", onglet: false },
  // Ce que la technique dit aux commerciaux de transmettre aux clients (25/11/2026).
  { href: "/pilot/support", libelle: "Support", Icone: IconLifebuoy, teinte: "orange", groupe: "quotidien", onglet: false },
  { href: "/pilot/demandes", libelle: "Demandes", Icone: IconSend, teinte: "violet", groupe: "quotidien", onglet: false },
  { href: "/pilot/attentes", libelle: "Relances", Icone: IconHourglass, teinte: "jaune", groupe: "quotidien", onglet: false },
  // Coquille cliente : pas de compteur qui recharge les alertes à chaque navigation.
  { href: "/pilot/alertes", libelle: "Alertes", Icone: IconBell, teinte: "rouge", groupe: "quotidien", onglet: true },
  { href: "/pilot/organisations", libelle: "Clients", Icone: IconUsersGroup, teinte: "indigo", groupe: "quotidien", onglet: false },
  { href: "/pilot/comptes", libelle: "Comptes à relier", Icone: IconPlugConnected, teinte: "cyan", groupe: "quotidien", onglet: false },
  { href: "/pilot/ca", libelle: "Chiffre d'affaires", Icone: IconChartLine, teinte: "sarcelle", groupe: "pilotage", onglet: false, exige: "voirCa" },
  { href: "/pilot/parc", libelle: "Centres à surveiller", Icone: IconHeartbeat, teinte: "rose", groupe: "pilotage", onglet: false },
  // Venus de l'admin du Dashboard le 23/11/2026 (plan 2026-11-pilot-dans-le-dashboard) : le suivi
  // du parc et du déploiement vit dans Pilot, la configuration reste au Dashboard.
  { href: "/pilot/parc-clients", libelle: "Parc clients", Icone: IconListDetails, teinte: "indigo", groupe: "pilotage", onglet: false },
  { href: "/pilot/versions", libelle: "Versions en ligne", Icone: IconServer2, teinte: "gris", groupe: "pilotage", onglet: false },
  { href: "/pilot/facturation", libelle: "Facturation", Icone: IconReceipt, teinte: "menthe", groupe: "pilotage", onglet: false, exige: "voirCa" },
  // Les groupes apportés, les commissions et les factures des apporteurs (C-63).
  { href: "/pilot/apports", libelle: "Apport d'affaires", Icone: IconHeartHandshake, teinte: "gris", groupe: "pilotage", onglet: false },
  // Les solutions concurrentes : leurs prix relevés, où elles sont en place, les affaires perdues contre elles (lot R).
  { href: "/pilot/concurrents", libelle: "Concurrents", Icone: IconSwords, teinte: "rose", groupe: "pilotage", onglet: false },
  // Les prospects, les clients et les concurrents en place sur la carte de France (lot U).
  { href: "/pilot/carte", libelle: "Carte", Icone: IconMap2, teinte: "vert", groupe: "pilotage", onglet: false },
  // La grille de prix en vigueur et les grilles datées : la source des propositions préremplies (lot S).
  { href: "/pilot/tarifs", libelle: "Tarifs", Icone: IconTag, teinte: "orange", groupe: "pilotage", onglet: false },
  // Les comptes de l'équipe et leurs droits : le super-administrateur seul (C-64).
  { href: "/pilot/equipe", libelle: "Équipe", Icone: IconUserShield, teinte: "bleu", groupe: "pilotage", onglet: false, exige: "superAdmin" },
];

/** Les entrées que ce compte peut ouvrir. */
const entreesDe = (compte: Compte) => ENTREES.filter((e) => !e.exige || compte[e.exige]);

const estActive = (chemin: string, href: string) => href === "/pilot" ? chemin === "/pilot" : chemin.startsWith(href);

/**
 * La pastille d'Aujourd'hui : les demandes à traiter et les commentaires non lus de l'utilisateur (lot T).
 * Le compte est relu par le navigateur (`useComptePourVous`) à chaque changement de page et après chaque
 * action qui le change : il n'attend pas un rechargement.
 */
function pastilleDe(entree: Entree, pourVous: ComptePourVous | null): { chiffre: string; phrase: string } | null {
  if (entree.href !== "/pilot" || !pourVous) return null;
  const chiffre = chiffrePastille(pourVous.demandes + pourVous.commentaires);
  return chiffre ? { chiffre, phrase: phrasePourVous(pourVous.demandes, pourVous.commentaires) } : null;
}

/** Le chiffre en rouge sur le coin d'une icône, comme sur iOS. Décoratif : l'étiquette du lien porte la phrase. */
function Pastille({ chiffre }: { chiffre: string }) {
  return <Box component="span" aria-hidden data-pastille sx={{ position: "absolute", top: -6, right: -8, minWidth: 16, height: 16, px: "4px", boxSizing: "border-box",
    display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 980, bgcolor: "error.main", color: "common.white",
    fontSize: 10, fontWeight: 700, lineHeight: 1, boxShadow: "0 0 0 1.5px #fff", pointerEvents: "none" }}>{chiffre}</Box>;
}

function EntreeMenu({ entree: { href, libelle, Icone, teinte }, active, pastille }: { entree: Entree; active: boolean; pastille: { chiffre: string; phrase: string } | null }) {
  return <ListItemButton component={Link} href={href} selected={active} aria-label={pastille ? `${libelle}, ${pastille.phrase}` : libelle} aria-current={active ? "page" : undefined}
    sx={{ px: { sm: 0, md: 1 }, gap: 1.25, minHeight: { sm: 44, md: 36 }, justifyContent: { sm: "center", md: "flex-start" }, borderRadius: "8px",
      "&.Mui-selected, &.Mui-selected:hover": { bgcolor: "primary.main", color: "common.white" } }}>
    <Box component="span" sx={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
      <Tuile Icone={Icone} teinte={teinte} taille={24} />
      {pastille && <Pastille chiffre={pastille.chiffre} />}
    </Box>
    <ListItemText primary={libelle} primaryTypographyProps={{ fontSize: 14, fontWeight: 500, color: "inherit", noWrap: true }}
      sx={{ display: { sm: "none", md: "block" }, m: 0 }} />
  </ListItemButton>;
}

function TitreGroupe({ children }: { children: string }) {
  return <Typography component="div" sx={{ display: { sm: "none", md: "block" }, fontSize: 11, fontWeight: 600, color: "text.secondary", px: 1, pt: 2.25, pb: 0.75 }}>{children}</Typography>;
}

/** Sous 600 px : quatre onglets, et le reste derrière « Plus ». */
function Onglets({ chemin, entrees, pourVous }: { chemin: string; entrees: Entree[]; pourVous: ComptePourVous | null }) {
  const [ancre, setAncre] = useState<HTMLElement | null>(null);
  const style = (actif: boolean) => ({ flex: 1, flexDirection: "column", gap: "2px", fontSize: 10, fontWeight: 600, borderRadius: 999, my: 0.75, lineHeight: 1.1, textAlign: "center",
    color: actif ? "primary.main" : "text.secondary", bgcolor: actif ? JETONS.accentFond : "transparent",
    "&&:hover": { color: actif ? "primary.main" : "text.primary" } });
  const autres = entrees.filter((e) => !e.onglet);
  // Capsule flottante au-dessus du contenu, comme la barre d'onglets d'iOS 26.
  return <Box component="nav" aria-label="Menu principal" sx={{ display: { xs: "flex", sm: "none" }, position: "fixed", zIndex: (t) => t.zIndex.appBar,
    bottom: "max(12px, env(safe-area-inset-bottom))", left: 12, right: 12, height: HAUTEUR_ONGLETS, px: 0.75,
    borderRadius: 999, ...ILOT }}>
    {entrees.filter((e) => e.onglet).map((entree) => {
      const { href, libelle, Icone } = entree;
      const actif = estActive(chemin, href);
      const pastille = pastilleDe(entree, pourVous);
      return <ButtonBase key={href} component={Link} href={href} aria-current={actif ? "page" : undefined} aria-label={pastille ? `${libelle}, ${pastille.phrase}` : undefined} sx={style(actif)}>
        <Box component="span" sx={{ position: "relative", display: "inline-flex" }}><Icone size={24} stroke={actif ? 2 : 1.6} />{pastille && <Pastille chiffre={pastille.chiffre} />}</Box>
        {libelle}
      </ButtonBase>;
    })}
    <ButtonBase aria-haspopup="menu" aria-expanded={Boolean(ancre)} onClick={(e) => setAncre(e.currentTarget)} sx={style(autres.some((e) => estActive(chemin, e.href)))}>
      <IconDots size={24} stroke={1.6} />Plus
    </ButtonBase>
    <Menu anchorEl={ancre} open={Boolean(ancre)} onClose={() => setAncre(null)}>
      {autres.map(({ href, libelle, Icone, teinte }) => <MenuItem key={href} component={Link} href={href} selected={estActive(chemin, href)} onClick={() => setAncre(null)} sx={{ gap: 1.25 }}>
        <Tuile Icone={Icone} teinte={teinte} taille={24} />{libelle}
      </MenuItem>)}
      <Divider />
      <MenuItem component={Link} href="/pilot/compte" onClick={() => setAncre(null)} sx={{ gap: 1.25 }}><IconUserCircle size={22} />Mon compte</MenuItem>
      <BasculeEspace forme="menu" onClick={() => setAncre(null)} />
      <MenuItem onClick={() => void signOut({ callbackUrl: "/authentication/signin" })} sx={{ gap: 1.25, color: "error.main" }}><IconLogout size={22} />Se déconnecter</MenuItem>
    </Menu>
  </Box>;
}

const initiales = (nom: string) => nom.split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]!.toUpperCase()).join("");

/** En bas du menu : qui est connecté, l'accès à son compte et la déconnexion. */
function BlocCompte({ compte }: { compte: Compte | null }) {
  const [ancre, setAncre] = useState<HTMLElement | null>(null);
  if (!compte) return null;
  return <Box sx={{ mt: "auto", p: 1.25 }}>
    <ButtonBase aria-haspopup="menu" aria-expanded={Boolean(ancre)} aria-label={`Compte de ${compte.nom}`} onClick={(e) => setAncre(e.currentTarget)}
      sx={{ width: "100%", gap: 1.25, p: 1, borderRadius: "12px", justifyContent: { sm: "center", md: "flex-start" }, textAlign: "left", "&:hover": { bgcolor: "rgba(0,0,0,0.05)" } }}>
      <Avatar sx={{ width: 32, height: 32, fontSize: 13, fontWeight: 600, bgcolor: JETONS.encre }}>{initiales(compte.nom)}</Avatar>
      <Box sx={{ display: { sm: "none", md: "block" }, minWidth: 0 }}>
        <Typography component="div" noWrap sx={{ fontSize: 14, fontWeight: 600, lineHeight: 1.2 }}>{compte.nom}</Typography>
        <Typography component="div" noWrap sx={{ fontSize: 12, color: "text.secondary" }}>{compte.role}</Typography>
      </Box>
    </ButtonBase>
    <Menu anchorEl={ancre} open={Boolean(ancre)} onClose={() => setAncre(null)} anchorOrigin={{ vertical: "top", horizontal: "left" }} transformOrigin={{ vertical: "bottom", horizontal: "left" }}>
      <MenuItem component={Link} href="/pilot/compte" onClick={() => setAncre(null)} sx={{ gap: 1 }}><IconUserCircle size={18} />Mon compte</MenuItem>
      <BasculeEspace forme="menu" onClick={() => setAncre(null)} />
      <Divider />
      <MenuItem onClick={() => void signOut({ callbackUrl: "/authentication/signin" })} sx={{ gap: 1, color: "error.main" }}><IconLogout size={18} />Se déconnecter</MenuItem>
    </Menu>
  </Box>;
}

function Logo({ taille = 32 }: { taille?: number }) {
  return <Box aria-hidden sx={{ width: taille, height: taille, flexShrink: 0, borderRadius: `${Math.round(taille * 0.26)}px`, background: JETONS.logo,
    display: "grid", placeItems: "center", color: "common.white", boxShadow: JETONS.ombreLogo }}>
    <IconNavigation size={Math.round(taille * 0.55)} stroke={2.25} />
  </Box>;
}

/** `role` est le libellé affiché ; `voirCa`, `superAdmin` et le mot de passe provisoire viennent des droits relus en base (C-64). */
export type Compte = { nom: string; email: string; role: string; voirCa: boolean; superAdmin: boolean; motDePasseProvisoire: boolean };

export function Coquille({ children, compte }: { children: React.ReactNode; compte: Compte | null }) {
  const cheminReel = (usePathname() ?? "");
  // Une page peut dire sa rubrique quand l'adresse ne suffit pas : la fiche d'un prospect allume Prospects (C-87).
  const [rubrique, setRubrique] = useState<string | null>(null);
  // Sur une fiche, rien ne s'allume avant qu'elle ait dit sa rubrique : « Clients » ne clignote pas sur un prospect.
  const chemin = rubrique ?? (/^\/pilot\/organisations\/\d+/.test(cheminReel) ? "" : cheminReel);
  // Sous 600 px, la loupe de la barre ouvre le champ de recherche sur toute sa largeur.
  const [rechercheMobile, setRechercheMobile] = useState(false);
  // La pastille d'Aujourd'hui, relue par le navigateur (lot T). Rien n'est lu sur la page de connexion.
  const pourVous = useComptePourVous(compte !== null && !cheminReel.startsWith("/connexion"), cheminReel);
  // La page de connexion s'affiche seule, sans menu.
  if (cheminReel.startsWith("/connexion") || !compte) return <>{children}</>;
  const entrees = entreesDe(compte);

  return (
    <RubriqueContexte.Provider value={setRubrique}>
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      {/* La barre latérale flotte : un îlot de verre détaché des bords, le fond de page continue derrière. */}
      <Box sx={{ display: { xs: "none", sm: "block" }, flexShrink: 0, width: LARGEUR_MENU, position: "sticky", top: 0, height: "100vh", p: 1.5, pr: 0, zIndex: (t) => t.zIndex.drawer }}>
      <Box component="aside" sx={{
        display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", borderRadius: "22px", ...ILOT,
      }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, height: 68, px: { sm: 0, md: 2.25 }, justifyContent: { sm: "center", md: "flex-start" }, flexShrink: 0 }}>
          <Logo />
          <Box sx={{ display: { sm: "none", md: "block" }, minWidth: 0 }}>
            <Typography component="div" sx={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.015em", lineHeight: 1.15, whiteSpace: "nowrap" }}>Lyrae Pilot</Typography>
            <Typography component="div" sx={{ fontSize: 12, color: "text.secondary", whiteSpace: "nowrap" }}>Le suivi des clients Lyrae</Typography>
          </Box>
        </Box>
        <List component="nav" aria-label="Menu principal" sx={{ px: 1.25, pt: 0.5, pb: 2, display: "flex", flexDirection: "column", gap: "2px" }}>
          <TitreGroupe>Au quotidien</TitreGroupe>
          {entrees.filter((e) => e.groupe === "quotidien").map((e) => <EntreeMenu key={e.href} entree={e} active={estActive(chemin, e.href)} pastille={pastilleDe(e, pourVous)} />)}
          <TitreGroupe>Pilotage</TitreGroupe>
          <Box aria-hidden sx={{ display: { sm: "block", md: "none" }, borderTop: FILET, mx: 1, my: 1 }} />
          {entrees.filter((e) => e.groupe === "pilotage").map((e) => <EntreeMenu key={e.href} entree={e} active={estActive(chemin, e.href)} pastille={pastilleDe(e, pourVous)} />)}
        </List>
        <BlocCompte compte={compte} />
      </Box>
      </Box>

      <Box sx={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {/* Barre d'outils : la recherche flotte en capsule. Pas de filet : le contenu passe dessous dans un fondu flouté (effet de bord de défilement). */}
        <Box component="header" sx={{
          position: "sticky", top: 0, zIndex: (t) => t.zIndex.appBar, height: HAUTEUR_BARRE + 12, flexShrink: 0,
          display: "flex", alignItems: "center", gap: 1.5, px: { xs: 1.5, sm: 3, md: 5 }, pt: 1.5,
          "&::before": { content: '""', position: "absolute", inset: 0, bottom: -24, zIndex: -1, pointerEvents: "none",
            background: `linear-gradient(to bottom, ${JETONS.surface} 40%, transparent)`, ...VERRE_LEGER,
            maskImage: "linear-gradient(to bottom, black 55%, transparent)", WebkitMaskImage: "linear-gradient(to bottom, black 55%, transparent)" },
        }}>
          <Box sx={{ display: { xs: rechercheMobile ? "none" : "flex", sm: "none" }, alignItems: "center", gap: 1, height: 44, pl: 0.75, pr: 1.5, borderRadius: 999, ...ILOT }}>
            <Logo taille={28} />
            <Typography component="div" sx={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.015em", whiteSpace: "nowrap" }}>Lyrae Pilot</Typography>
          </Box>
          <Recherche mobileOuvert={rechercheMobile} onMobile={setRechercheMobile} />
          {/* La cloche commune au Dashboard et à Pilot, et le retour au Dashboard. */}
          <Box sx={{ display: { xs: rechercheMobile ? "none" : "flex", sm: "flex" }, alignItems: "center", gap: 1, ml: "auto", flexShrink: 0 }}>
            <Box sx={{ borderRadius: 999, ...ILOT }}><NotificationBell /></Box>
            <Box sx={{ display: { xs: "none", sm: "block" } }}><BasculeEspace /></Box>
          </Box>
        </Box>

        <Box component="main" sx={{ flexGrow: 1, minWidth: 0, px: { xs: 2, sm: 3, md: 5 }, pt: { xs: 2, md: 3.5 }, pb: { xs: `${HAUTEUR_ONGLETS + 40}px`, sm: 6, md: 8 } }}>
          <Box sx={{ maxWidth: 1240 }}>
            {compte.motDePasseProvisoire && !cheminReel.startsWith("/pilot/compte") && <Alert severity="warning" icon={false} sx={{ mb: 2.5 }}
              action={<Button component={Link} href="/pilot/compte#mot-de-passe" color="inherit" size="small">Choisir</Button>}>
              Votre mot de passe est provisoire. Choisissez le vôtre dans Mon compte.
            </Alert>}
            {children}
          </Box>
        </Box>
      </Box>
      <Onglets chemin={chemin} entrees={entrees} pourVous={pourVous} />
    </Box>
    </RubriqueContexte.Provider>
  );
}
