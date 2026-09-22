"use client";

import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { IconEdit, IconLock, IconLogout, IconTrash, IconUserCircle } from "@tabler/icons-react";
import { PAGE_GROUPS, type PageKey } from "@/lib/permissions";
import { STATUTS, type StatutCentre } from "@/lib/centreStatut";
import { BORDER, TEXT_MAIN, TEXT_MUTED } from "@/lib/jetons";

/**
 * Les briques d'affichage de l'ecran « Clients et comptes » (lot 3, 15/09/2026).
 *
 * **Pourquoi elles vivent ici et non dans la page.** Un fichier `page.tsx` de Next ne
 * doit exporter qu'une page : ses composants internes ne sont donc importables nulle
 * part, et notamment pas depuis une page d'apercu. Or ces quatre-la sont precisement
 * ce qu'il faut REGARDER : c'est dans le rendu que vivent les defauts que ni `tsc`, ni
 * le lint, ni le build ne peuvent voir.
 *
 * La lecon vient de l'ecran de mapping, le 14/09/2026 : trois defauts visuels y
 * compilaient parfaitement, et seule l'ouverture de l'ecran les a trouves.
 */

export type Compte = {
  id: number;
  nom: string | null;
  identifiant: string;
  centreRole: string | null;
  isSecretary: boolean;
  managerId: number | null;
  estSousCompte: boolean;
  permissions: Partial<Record<PageKey, "none" | "read" | "write">> | null;
  verrouilleJusqua: string | null;
  creeLe: string;
};

export type Produit = {
  slug: string;
  libelle: string;
  /** `UserProduct.id` : l'identifiant du CENTRE dans tout l'ecosysteme. */
  userProductId: number;
  /**
   * `Product.id` : l'identifiant du PRODUIT au catalogue, et le seul qu'attendent
   * `POST` et `DELETE /api/admin/clients/:id/products`. Ne pas confondre avec le
   * precedent : les deux sont des entiers, et l'erreur est silencieuse.
   */
  productId: number;
  affilieLe: string;
  statut: StatutCentre;
  bloquants: number;
  degrades: number;
  satisfaites: number;
  total: number;
};

export type Ligne = {
  userId: number;
  nom: string | null;
  identifiant: string;
  centreRole: string | null;
  produits: Produit[];
  comptes: Compte[];
};
/**
 * Un produit affilié, avec où en est sa mise en service.
 *
 * Le produit seul ne dit rien : « LyraeKonnect » chez un client peut aussi bien être un
 * portail en service qu'une case cochée la veille. Le statut et le nombre de manques
 * bloquants sont ce qui distingue les deux, et le registre de complétude les calcule
 * déjà. Un point rouge signale qu'il reste des manques bloquants, c'est-à-dire que le
 * produit ne peut pas servir en l'état.
 */
export function PastilleProduit({ produit }: { produit: Produit }) {
  const description = STATUTS[produit.statut];
  const bloque = produit.bloquants > 0;
  return (
    <Tooltip
      title={
        produit.total === 0
          ? `${description.libelle}. Rien n'est encore renseigné.`
          : `${description.libelle}. ${produit.satisfaites} exigence(s) sur ${produit.total} satisfaites` +
            (bloque ? `, ${produit.bloquants} bloquante(s) restante(s).` : ".")
      }
    >
      <Chip
        size="small"
        label={
          <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.6 }}>
            {bloque && (
              <Box
                component="span"
                sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: "#B3261E" }}
              />
            )}
            {produit.libelle}
            {produit.total > 0 && (
              <Box component="span" sx={{ opacity: 0.75, fontWeight: 500 }}>
                {produit.satisfaites}/{produit.total}
              </Box>
            )}
          </Box>
        }
        sx={{
          bgcolor: description.couleur.fond,
          color: description.couleur.texte,
          fontWeight: 700,
          border: `1px solid ${description.couleur.texte}22`,
        }}
      />
    </Tooltip>
  );
}

/** Une ligne de compte, avec le résumé de ses droits et ses trois gestes. */
export function CarteCompte({
  compte,
  estSuperAdmin,
  onDroits,
  onExpulser,
  onSupprimer,
}: {
  compte: Compte;
  estSuperAdmin: boolean;
  onDroits: () => void;
  onExpulser: () => void;
  onSupprimer: () => void;
}) {
  const verrouille =
    compte.verrouilleJusqua !== null && new Date(compte.verrouilleJusqua) > new Date();

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        p: 1.5,
        border: `1px solid ${BORDER}`,
        borderRadius: 1.5,
        bgcolor: compte.estSousCompte ? "transparent" : "rgba(var(--accent-rgb), 0.04)",
      }}
    >
      <IconUserCircle size={20} color={TEXT_MUTED} />

      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: TEXT_MAIN }}>
            {compte.nom ?? compte.identifiant}
          </Typography>
          <Chip
            label={compte.estSousCompte ? "Sous-compte" : "Compte principal"}
            size="small"
            sx={{ height: 19, fontSize: 11, fontWeight: 700 }}
            color={compte.estSousCompte ? "default" : "primary"}
          />
          {compte.centreRole === "USER" && (
            <Chip label="Rattaché" size="small" variant="outlined" sx={{ height: 19, fontSize: 11 }} />
          )}
          {verrouille && (
            <Tooltip title="Compte verrouillé après des échecs de connexion répétés">
              <Chip
                icon={<IconLock size={12} />}
                label="Verrouillé"
                size="small"
                color="warning"
                sx={{ height: 19, fontSize: 11 }}
              />
            </Tooltip>
          )}
        </Stack>
        {/*
          L'identifiant ne s'affiche que s'il DIFFERE du nom montre au-dessus. Un compte
          sans nom retombe sur son identifiant, et la ligne du dessous le repetait alors
          a l'identique : `pontivy_verrouille` apparaissait deux fois. Defaut vu a
          l'ecran le 15/09/2026.
        */}
        {compte.nom !== null && compte.nom !== compte.identifiant && (
          <Typography variant="caption" sx={{ color: TEXT_MUTED }}>
            {compte.identifiant}
          </Typography>
        )}
        <ResumeDroits permissions={compte.permissions} />
      </Box>

      {estSuperAdmin && (
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Modifier les droits">
            <IconButton size="small" onClick={onDroits}>
              <IconEdit size={17} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Fermer ses sessions ouvertes">
            <IconButton size="small" onClick={onExpulser}>
              <IconLogout size={17} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Supprimer le compte">
            <IconButton size="small" onClick={onSupprimer} sx={{ color: "#B3261E" }}>
              <IconTrash size={17} />
            </IconButton>
          </Tooltip>
        </Stack>
      )}
    </Box>
  );
}

/**
 * Le résumé des droits, par produit.
 *
 * Vingt-six pages ne se listent pas dans une ligne de tableau. On compte donc, par
 * groupe, combien de pages sont accordées et combien le sont en écriture : c'est ce
 * qu'on veut savoir d'un coup d'œil, le détail s'ouvrant dans la boîte de dialogue.
 */
export function ResumeDroits({ permissions }: { permissions: Compte["permissions"] }) {
  if (!permissions) {
    return (
      <Typography variant="caption" sx={{ color: TEXT_MUTED, display: "block", mt: 0.25 }}>
        Accès complet à son centre
      </Typography>
    );
  }

  const parGroupe = PAGE_GROUPS.map((groupe) => {
    const accordees = groupe.pages.filter((p) => {
      const n = permissions[p];
      return n === "read" || n === "write";
    });
    const ecriture = accordees.filter((p) => permissions[p] === "write").length;
    return { titre: groupe.titre, total: groupe.pages.length, accordees: accordees.length, ecriture };
  }).filter((g) => g.accordees > 0);

  if (parGroupe.length === 0) {
    return (
      <Typography variant="caption" sx={{ color: "#B3261E", display: "block", mt: 0.25 }}>
        Aucune page accordée. Ce compte ne peut rien ouvrir.
      </Typography>
    );
  }

  return (
    <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: "wrap", gap: 0.5 }}>
      {parGroupe.map((g) => (
        <Tooltip
          key={g.titre}
          title={`${g.accordees} page(s) sur ${g.total}, dont ${g.ecriture} en écriture`}
        >
          <Chip
            label={`${g.titre} ${g.accordees}/${g.total}`}
            size="small"
            variant="outlined"
            sx={{ height: 18, fontSize: 10.5 }}
          />
        </Tooltip>
      ))}
    </Stack>
  );
}

/**
 * La suppression demande de retaper l'identifiant.
 *
 * `admin/users` posait la question par un `confirm()` natif du navigateur, qu'on valide
 * sans le lire. Or la suppression est le seul des trois gestes qui ne se rattrape pas,
 * et elle emporte les sous-comptes par cascade. Retaper l'identifiant force à regarder
 * lequel on supprime, ce que `manage-clients` faisait déjà de son côté.
 */
export function DialogSuppression({
  compte,
  saisie,
  onSaisie,
  enCours,
  onAnnuler,
  onConfirmer,
}: {
  compte: Compte | null;
  saisie: string;
  onSaisie: (v: string) => void;
  enCours: boolean;
  onAnnuler: () => void;
  onConfirmer: () => void;
}) {
  const correspond = compte !== null && saisie.trim() === compte.identifiant;
  return (
    <Dialog open={compte !== null} onClose={onAnnuler} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Supprimer ce compte</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          {compte?.estSousCompte
            ? "Ce sous-compte perdra son accès immédiatement."
            : "C'est le compte principal du client. Ses sous-comptes seront supprimés avec lui."}{" "}
          Cette suppression ne s&apos;annule pas.
        </DialogContentText>
        <DialogContentText sx={{ mb: 1, fontSize: 14 }}>
          Retapez <strong>{compte?.identifiant}</strong> pour confirmer.
        </DialogContentText>
        <TextField
          fullWidth
          size="small"
          autoFocus
          value={saisie}
          onChange={(e) => onSaisie(e.target.value)}
          placeholder={compte?.identifiant}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onAnnuler}>
          Annuler
        </Button>
        <Button
          variant="contained"
          color="error"
          disabled={!correspond || enCours}
          onClick={onConfirmer}
        >
          {enCours ? "Suppression…" : "Supprimer"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
