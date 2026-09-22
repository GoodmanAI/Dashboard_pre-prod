"use client";

import Retour from "@/components/shared/Retour";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  IconChevronDown,
  IconChevronRight,
  IconEdit,
  IconLock,
  IconLogout,
  IconPlugConnectedX,
  IconPlus,
  IconTrash,
  IconUserCircle,
  IconUsers,
} from "@tabler/icons-react";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";
import CreateAccountDialog from "@/components/admin/users/CreateAccountDialog";
import EditPermissionsDialog from "@/components/admin/users/EditPermissionsDialog";
import { PAGE_GROUPS, type PageKey } from "@/lib/permissions";
import { ORDRE_PRODUITS, PRODUITS, type SlugProduit } from "@/lib/produits";
import { STATUTS, type StatutCentre } from "@/lib/centreStatut";
import {
  CarteCompte,
  DialogSuppression,
  PastilleProduit,
  type Compte,
  type Ligne,
  type Produit,
} from "@/components/admin/comptes/briques";

/**
 * Clients et comptes — la vue d'ensemble de l'administration (lot 3, 15/09/2026).
 *
 * **Ce que cet écran répond, et qu'aucun autre ne répondait** : qui sont mes clients par
 * produit, quels comptes existent chez chacun, et qui a le droit de quoi.
 *
 * L'information existait, dispersée sur cinq écrans, chacun rangé PAR GESTE plutôt que
 * par client : `manage-clients` demande de choisir un client dans un menu déroulant
 * différent à chaque onglet, `users` liste les comptes sans savoir de quel produit ils
 * relèvent, `parc` connaît les produits mais pas les comptes. Reconstituer « ce client,
 * ses produits, ses comptes » demandait d'ouvrir trois écrans et de recouper à la main.
 *
 * **Cet écran n'écrit rien lui-même.** Chaque action appelle la route qui la faisait
 * déjà, avec sa garde : les comptes sont réservés au SUPER_ADMIN, les produits à
 * l'ADMIN. Recopier ces gardes ici aurait créé un second endroit où elles peuvent
 * diverger, et c'est ce genre de duplication qui a produit les trois écrans où l'on
 * saisit aujourd'hui le même identifiant de cabinet.
 *
 * Les deux boîtes de dialogue (création, édition des droits) sont celles de
 * `admin/users`, importées telles quelles.
 */

const BRAND_TEAL = "var(--accent)";
const TEXT_MAIN = "#1F3448";
const TEXT_MUTED = "#7A8FA6";
const BORDER = "#E4EAEE";

export default function ComptesPage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtreProduit, setFiltreProduit] = useState<SlugProduit | "tous">("tous");
  const [recherche, setRecherche] = useState("");
  const [ouverts, setOuverts] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<string | null>(null);

  const [droitsDe, setDroitsDe] = useState<Compte | null>(null);
  const [creationPour, setCreationPour] = useState<Ligne | null>(null);
  const [aSupprimer, setASupprimer] = useState<Compte | null>(null);
  const [confirmationSaisie, setConfirmationSaisie] = useState("");
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);
  const [aRetirer, setARetirer] = useState<{ ligne: Ligne; produit: Produit } | null>(null);
  const [affiliationPour, setAffiliationPour] = useState<{
    ligne: Ligne;
    /** `null` tant que le catalogue charge. */
    disponibles: { productId: number; libelle: string }[] | null;
  } | null>(null);

  const estSuperAdmin = session?.user?.role === "SUPER_ADMIN";

  // La page vit sous `/admin`, donc `src/app/admin/layout.tsx` la garde déjà côté
  // serveur. Cette redirection ne sert qu'au confort : un ADMIN qui arrive ici voit
  // tout, mais ne peut pas toucher aux comptes, et il vaut mieux le lui dire.
  useEffect(() => {
    if (status === "unauthenticated") router.push("/authentication/signin");
  }, [status, router]);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const res = await fetch("/api/admin/clients-comptes");
      const data = await res.json();
      if (!res.ok) {
        setErreur(data?.error ?? "Impossible de charger les clients.");
        return;
      }
      setLignes(data.lignes ?? []);
    } catch {
      setErreur("Impossible de joindre le serveur.");
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") charger();
  }, [status, charger]);

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return lignes.filter((l) => {
      if (filtreProduit !== "tous" && !l.produits.some((p) => p.slug === filtreProduit)) {
        return false;
      }
      if (!q) return true;
      const champs = [l.nom ?? "", l.identifiant, ...l.comptes.map((c) => c.identifiant)];
      return champs.some((v) => v.toLowerCase().includes(q));
    });
  }, [lignes, filtreProduit, recherche]);

  const basculer = (userId: number) =>
    setOuverts((prev) => {
      const suivant = new Set(prev);
      if (suivant.has(userId)) suivant.delete(userId);
      else suivant.add(userId);
      return suivant;
    });

  const expulser = async (compte: Compte) => {
    const res = await fetch(`/api/admin/users/${compte.id}/kick`, { method: "POST" });
    if (res.ok) {
      setMessage(`Sessions de ${compte.identifiant} fermées.`);
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(data?.error ?? "La déconnexion a échoué.");
    }
  };

  const supprimer = async () => {
    if (!aSupprimer) return;
    setSuppressionEnCours(true);
    const res = await fetch(`/api/admin/users/${aSupprimer.id}`, { method: "DELETE" });
    setSuppressionEnCours(false);
    if (res.ok) {
      setMessage(`Compte ${aSupprimer.identifiant} supprimé.`);
      setASupprimer(null);
      setConfirmationSaisie("");
      charger();
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(data?.error ?? "La suppression a échoué.");
    }
  };

  /**
   * Retirer un produit, c'est le geste REVERSIBLE des trois : la ligne d'affiliation
   * n'est jamais supprimee, seulement datee (`UserProduct.removedAt`). Le client perd
   * l'acces, sa configuration reste, et on peut le lui rendre.
   *
   * Il ne doit donc pas etre presente comme la suppression du compte, qui est
   * definitive et emporte les sous-comptes.
   */
  const retirerProduit = async () => {
    if (!aRetirer) return;
    const { ligne, produit } = aRetirer;
    const res = await fetch(
      `/api/admin/clients/${ligne.userId}/products?productId=${produit.productId}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setMessage(`${produit.libelle} retire a ${ligne.nom ?? ligne.identifiant}.`);
      setARetirer(null);
      charger();
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(data?.error ?? "Le retrait a echoue.");
    }
  };

  /**
   * Affilier un produit.
   *
   * Le catalogue des produits NON affilies n'est pas dans la reponse d'agregation : il
   * n'interesse que ce geste, rare, et l'y mettre alourdirait chaque chargement de la
   * liste. On le demande donc a la demande, a la route qui le sait deja
   * (`GET /api/admin/clients/:id/products` rend le catalogue entier avec l'etat
   * d'affiliation de chaque ligne).
   */
  const ouvrirAffiliation = async (ligne: Ligne) => {
    setAffiliationPour({ ligne, disponibles: null });
    try {
      const res = await fetch(`/api/admin/clients/${ligne.userId}/products`);
      const data = await res.json();
      if (!res.ok) {
        setMessage(data?.error ?? "Impossible de lire le catalogue.");
        setAffiliationPour(null);
        return;
      }
      const libres = (data.rows ?? []).filter((r: any) => !r.affilie);
      setAffiliationPour({ ligne, disponibles: libres });
    } catch {
      setMessage("Impossible de joindre le serveur.");
      setAffiliationPour(null);
    }
  };

  const affilier = async (productId: number, libelle: string) => {
    if (!affiliationPour) return;
    const { ligne } = affiliationPour;
    const res = await fetch(`/api/admin/clients/${ligne.userId}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
    });
    if (res.ok) {
      setMessage(`${libelle} affilié à ${ligne.nom ?? ligne.identifiant}.`);
      setAffiliationPour(null);
      charger();
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(data?.error ?? "L'affiliation a échoué.");
    }
  };

  const clientsPourDialogue = useMemo(
    () => lignes.map((l) => ({ id: l.userId, name: l.nom, email: l.identifiant })),
    [lignes]
  );

  if (status === "loading" || chargement) {
    return (
      <PageContainer title="Clients et comptes" description="Vue d'ensemble">
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress sx={{ color: BRAND_TEAL }} />
        </Box>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="Clients et comptes"
      description="Les clients par produit, leurs comptes et leurs droits"
    >
      <Box>
      <SectionHeader
        title="Clients et comptes"
        subtitle="Un client, ses produits, ses comptes et les droits de chacun."
      />

      {!estSuperAdmin && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Vous voyez le parc en lecture. Créer, modifier ou supprimer un compte demande un
          accès super administrateur.
        </Alert>
      )}

      {erreur && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {erreur}
        </Alert>
      )}

      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        sx={{ mb: 2, alignItems: { md: "center" } }}
      >
        {/*
          `textTransform: "none"` n'est pas cosmetique : le theme MUI du depot pose
          `capitalize` sur la typographie `button` (`utils/theme/DefaultColors.tsx:103`),
          qui s'applique aussi aux `ToggleButton`. Sans cette ligne, « Tous les produits »
          s'affiche « Tous Les Produits ». Defaut vu a l'ecran le 15/09/2026, invisible a
          la compilation comme au lint.
        */}
        <ToggleButtonGroup
          size="small"
          exclusive
          value={filtreProduit}
          onChange={(_, v) => v && setFiltreProduit(v)}
          sx={{ "& .MuiToggleButton-root": { textTransform: "none" } }}
        >
          <ToggleButton value="tous">Tous les produits</ToggleButton>
          {ORDRE_PRODUITS.map((slug) => (
            <ToggleButton key={slug} value={slug}>
              {PRODUITS[slug].libelle}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        <TextField
          size="small"
          placeholder="Chercher un client ou un identifiant"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          sx={{ minWidth: 280 }}
        />

        <Box sx={{ flex: 1 }} />

        <Typography variant="body2" sx={{ color: TEXT_MUTED }}>
          {visibles.length} client{visibles.length > 1 ? "s" : ""}
        </Typography>
      </Stack>

      {visibles.length === 0 ? (
        <Card sx={{ p: 4, textAlign: "center" }}>
          <Typography sx={{ color: TEXT_MUTED }}>
            Aucun client ne correspond. Changez le filtre ou la recherche.
          </Typography>
        </Card>
      ) : (
        <Stack spacing={1.5}>
          {visibles.map((ligne) => {
            const ouvert = ouverts.has(ligne.userId);
            const sousComptes = ligne.comptes.filter((c) => c.estSousCompte).length;
            return (
              <Card key={ligne.userId} sx={{ border: `1px solid ${BORDER}` }}>
                <Box
                  onClick={() => basculer(ligne.userId)}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    p: 2,
                    cursor: "pointer",
                    "&:hover": { bgcolor: "rgba(var(--accent-rgb), 0.03)" },
                  }}
                >
                  {ouvert ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}

                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography sx={{ fontWeight: 700, color: TEXT_MAIN }}>
                      {ligne.nom ?? ligne.identifiant}
                    </Typography>
                    <Typography variant="caption" sx={{ color: TEXT_MUTED }}>
                      {ligne.identifiant}
                      {ligne.centreRole === "ADMIN_USER" && " · gère plusieurs centres"}
                    </Typography>
                  </Box>

                  <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5 }}>
                    {ligne.produits.length === 0 ? (
                      <Chip label="Aucun produit" size="small" variant="outlined" />
                    ) : (
                      ligne.produits.map((p) => <PastilleProduit key={p.userProductId} produit={p} />)
                    )}
                  </Stack>

                  <Tooltip
                    title={`${ligne.comptes.length} compte(s), dont ${sousComptes} sous-compte(s)`}
                  >
                    <Chip
                      icon={<IconUsers size={14} />}
                      label={ligne.comptes.length}
                      size="small"
                      variant="outlined"
                    />
                  </Tooltip>
                </Box>

                <Collapse in={ouvert} unmountOnExit>
                  <Divider />
                  <Box sx={{ p: 2, pb: 1 }}>
                    <Stack
                      direction="row"
                      sx={{ mb: 1, alignItems: "center", justifyContent: "space-between" }}
                    >
                      <Typography variant="overline" sx={{ color: TEXT_MUTED, fontWeight: 700 }}>
                        Produits
                      </Typography>
                      {estSuperAdmin && (
                        <Button
                          size="small"
                          startIcon={<IconPlus size={15} />}
                          onClick={() => ouvrirAffiliation(ligne)}
                          sx={{ textTransform: "none" }}
                        >
                          Affilier un produit
                        </Button>
                      )}
                    </Stack>
                    {ligne.produits.length === 0 ? (
                      <Typography variant="body2" sx={{ color: TEXT_MUTED }}>
                        Ce client n&apos;a aucun produit. Affiliez-en un depuis la gestion des
                        clients.
                      </Typography>
                    ) : (
                      <Stack spacing={0.75}>
                        {ligne.produits.map((p) => (
                          <Box
                            key={p.userProductId}
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1.5,
                              p: 1.25,
                              border: `1px solid ${BORDER}`,
                              borderRadius: 1.5,
                            }}
                          >
                            <PastilleProduit produit={p} />
                            <Typography variant="caption" sx={{ color: TEXT_MUTED, flex: 1 }}>
                              {p.bloquants > 0
                                ? `${p.bloquants} point(s) bloquant(s) avant la mise en service`
                                : p.total === 0
                                  ? "Rien n'est encore renseigné"
                                  : "Rien ne bloque la mise en service"}
                            </Typography>
                            {estSuperAdmin && (
                              <Tooltip title="Retirer ce produit au client">
                                <IconButton
                                  size="small"
                                  onClick={() => setARetirer({ ligne, produit: p })}
                                >
                                  <IconPlugConnectedX size={17} />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Box>
                        ))}
                      </Stack>
                    )}
                  </Box>

                  <Box sx={{ px: 2, pb: 2 }}>
                    <Stack
                      direction="row"
                      sx={{ mb: 1.5, alignItems: "center", justifyContent: "space-between" }}
                    >
                      <Typography variant="overline" sx={{ color: TEXT_MUTED, fontWeight: 700 }}>
                        Comptes
                      </Typography>
                      {estSuperAdmin && (
                        <Button
                          size="small"
                          startIcon={<IconPlus size={15} />}
                          onClick={() => setCreationPour(ligne)}
                          sx={{ textTransform: "none" }}
                        >
                          Ajouter un sous-compte
                        </Button>
                      )}
                    </Stack>

                    <Stack spacing={1}>
                      {ligne.comptes.map((compte) => (
                        <CarteCompte
                          key={compte.id}
                          compte={compte}
                          estSuperAdmin={estSuperAdmin}
                          onDroits={() => setDroitsDe(compte)}
                          onExpulser={() => expulser(compte)}
                          onSupprimer={() => {
                            setASupprimer(compte);
                            setConfirmationSaisie("");
                          }}
                        />
                      ))}
                    </Stack>
                  </Box>
                </Collapse>
              </Card>
            );
          })}
        </Stack>
      )}

      <EditPermissionsDialog
        user={
          droitsDe
            ? {
                id: droitsDe.id,
                name: droitsDe.nom,
                email: droitsDe.identifiant,
                permissions: droitsDe.permissions,
              }
            : null
        }
        onClose={() => setDroitsDe(null)}
        onSuccess={(msg) => {
          setMessage(msg);
          setDroitsDe(null);
          charger();
        }}
      />

      <CreateAccountDialog
        open={creationPour !== null}
        mode="sub-account"
        clients={clientsPourDialogue}
        onClose={() => setCreationPour(null)}
        onSuccess={(msg) => {
          setMessage(msg);
          setCreationPour(null);
          charger();
        }}
      />

      <Dialog
        open={affiliationPour !== null}
        onClose={() => setAffiliationPour(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Affilier un produit</DialogTitle>
        <DialogContent>
          {affiliationPour?.disponibles === null ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
              <CircularProgress size={24} sx={{ color: BRAND_TEAL }} />
            </Box>
          ) : affiliationPour?.disponibles?.length === 0 ? (
            <DialogContentText>
              {affiliationPour.ligne.nom ?? affiliationPour.ligne.identifiant} a déjà tous les
              produits du catalogue.
            </DialogContentText>
          ) : (
            <Stack spacing={1} sx={{ pt: 0.5 }}>
              <DialogContentText sx={{ mb: 1 }}>
                Le client aura accès au produit dès qu&apos;il sera affilié. Sa configuration
                reste à faire.
              </DialogContentText>
              {affiliationPour?.disponibles?.map((d) => (
                <Button
                  key={d.productId}
                  variant="outlined"
                  onClick={() => affilier(d.productId, d.libelle)}
                  sx={{ textTransform: "none", justifyContent: "flex-start" }}
                >
                  {d.libelle}
                </Button>
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAffiliationPour(null)} sx={{ textTransform: "none" }}>
            Fermer
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={aRetirer !== null} onClose={() => setARetirer(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Retirer ce produit</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {aRetirer?.ligne.nom ?? aRetirer?.ligne.identifiant} perdra l&apos;accès à{" "}
            {aRetirer?.produit.libelle}. Sa configuration est conservée, et vous pouvez lui
            rendre le produit plus tard.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setARetirer(null)} sx={{ textTransform: "none" }}>
            Annuler
          </Button>
          <Button variant="contained" onClick={retirerProduit} sx={{ textTransform: "none" }}>
            Retirer
          </Button>
        </DialogActions>
      </Dialog>

      <DialogSuppression
        compte={aSupprimer}
        saisie={confirmationSaisie}
        onSaisie={setConfirmationSaisie}
        enCours={suppressionEnCours}
        onAnnuler={() => {
          setASupprimer(null);
          setConfirmationSaisie("");
        }}
        onConfirmer={supprimer}
      />

      <Retour
        ouvert={message !== null}
        message={message ?? ""}
        gravite={"success"}
        onFermer={() => setMessage(null)}
      />
      </Box>
    </PageContainer>
  );
}
