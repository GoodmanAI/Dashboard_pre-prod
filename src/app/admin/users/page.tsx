"use client";

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
  IconButton,
  Menu,
  MenuItem,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  IconDots,
  IconEdit,
  IconLogout,
  IconPlus,
  IconShieldLock,
  IconTrash,
  IconUserCircle,
  IconUsers,
} from "@tabler/icons-react";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";
import CreateAccountDialog from "@/components/admin/users/CreateAccountDialog";
import EditPermissionsDialog from "@/components/admin/users/EditPermissionsDialog";
import { isSubAccount } from "@/lib/permissions";

/**
 * Page de gestion des comptes (chantier 3, Lot C).
 * -----------------------------------------------------------------------------
 * SUPER_ADMIN uniquement. Trois onglets :
 *   - Admins        : liste ADMIN + creation admin
 *   - Clients       : liste CLIENT principaux (permissions=null)
 *   - Sous-comptes  : liste CLIENT sous-compte (permissions custom set)
 *
 * Actions par ligne :
 *   - Edit permissions (sous-comptes) / Rename
 *   - Kick session (bump tokenVersion)
 *   - Delete
 */

const BRAND_TEAL = "var(--accent)";
const TEXT_MAIN = "#1F3448";
const TEXT_MUTED = "#7A8FA6";

type ApiUser = {
  id: number;
  name: string | null;
  email: string;
  role: "SUPER_ADMIN" | "ADMIN" | "CLIENT";
  centreRole: "ADMIN_USER" | "USER" | null;
  isSecretary: boolean;
  permissions: unknown;
  managerId: number | null;
  manager: { id: number; name: string | null; email: string } | null;
  tokenVersion: number;
  createdAt: string;
  updatedAt: string;
  _count: { managedUsers: number; userProducts: number };
};

type Tab = "admins" | "clients" | "sub-accounts";

export default function UsersManagementPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("admins");
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog states
  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"admin" | "sub-account">("admin");
  const [editingUser, setEditingUser] = useState<ApiUser | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{
    el: HTMLElement;
    user: ApiUser;
  } | null>(null);
  const [snack, setSnack] = useState<{ msg: string; kind: "success" | "error" } | null>(null);

  // Guard SUPER_ADMIN (route also blocked by API)
  useEffect(() => {
    if (status === "unauthenticated") router.push("/authentication/signin");
    else if (status === "authenticated" && session?.user?.role !== "SUPER_ADMIN") {
      router.push("/admin");
    }
  }, [status, session, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setUsers(Array.isArray(data.users) ? data.users : []);
    } catch (e: any) {
      setError(e?.message ?? "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role === "SUPER_ADMIN") {
      load();
    }
  }, [status, session, load]);

  // Filtre selon le tab
  const filteredUsers = useMemo(() => {
    if (tab === "admins") {
      return users.filter((u) => u.role === "ADMIN" || u.role === "SUPER_ADMIN");
    }
    if (tab === "clients") {
      return users.filter((u) => u.role === "CLIENT" && !isSubAccount(u));
    }
    return users.filter((u) => u.role === "CLIENT" && isSubAccount(u));
  }, [users, tab]);

  const clientsForParent = useMemo(
    () => users.filter((u) => u.role === "CLIENT" && !isSubAccount(u)),
    [users]
  );

  const handleCreateAdmin = () => {
    setCreateMode("admin");
    setCreateOpen(true);
  };
  const handleCreateSubAccount = () => {
    setCreateMode("sub-account");
    setCreateOpen(true);
  };

  const handleCloseMenu = () => setMenuAnchor(null);

  const handleKick = async () => {
    const u = menuAnchor?.user;
    handleCloseMenu();
    if (!u) return;
    if (!confirm(`Deconnecter ${u.email} de toutes ses sessions ?`)) return;
    try {
      const res = await fetch(`/api/admin/users/${u.id}/kick`, { method: "POST" });
      if (!res.ok) throw new Error("Kick failed");
      setSnack({ msg: `${u.email} deconnecte.`, kind: "success" });
      load();
    } catch (e: any) {
      setSnack({ msg: e?.message ?? "Erreur kick", kind: "error" });
    }
  };

  const handleDelete = async () => {
    const u = menuAnchor?.user;
    handleCloseMenu();
    if (!u) return;
    if (
      !confirm(
        `Supprimer definitivement le compte ${u.email} (${u.role}) ?\nCette action est irreversible.`
      )
    )
      return;
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setSnack({ msg: `${u.email} supprime.`, kind: "success" });
      load();
    } catch (e: any) {
      setSnack({ msg: e?.message ?? "Erreur suppression", kind: "error" });
    }
  };

  const handleEditPermissions = () => {
    if (!menuAnchor) return;
    setEditingUser(menuAnchor.user);
    handleCloseMenu();
  };

  if (status !== "authenticated" || session?.user?.role !== "SUPER_ADMIN") {
    return (
      <PageContainer title="Comptes" description="Gestion des comptes">
        <Box sx={{ display: "grid", placeItems: "center", minHeight: "60vh" }}>
          <CircularProgress />
        </Box>
      </PageContainer>
    );
  }

  const tabCount = (t: Tab) => {
    if (t === "admins") return users.filter((u) => u.role === "ADMIN" || u.role === "SUPER_ADMIN").length;
    if (t === "clients") return users.filter((u) => u.role === "CLIENT" && !isSubAccount(u)).length;
    return users.filter((u) => u.role === "CLIENT" && isSubAccount(u)).length;
  };

  return (
    <PageContainer
      title="Comptes & permissions"
      description="Gestion des admins, clients et sous-comptes"
    >
      <SectionHeader
        title="Comptes & permissions"
        subtitle="SUPER_ADMIN — creer, editer et deconnecter les comptes"
      />

      <Card sx={{ p: 0, overflow: "hidden" }}>
        {/* Header : tabs + actions */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid #e5e7eb",
            px: 2,
          }}
        >
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            sx={{
              "& .MuiTab-root": { textTransform: "none", fontWeight: 600 },
              "& .Mui-selected": { color: BRAND_TEAL },
              "& .MuiTabs-indicator": { backgroundColor: BRAND_TEAL },
            }}
          >
            <Tab
              value="admins"
              icon={<IconShieldLock size={16} />}
              iconPosition="start"
              label={`Admins (${tabCount("admins")})`}
            />
            <Tab
              value="clients"
              icon={<IconUserCircle size={16} />}
              iconPosition="start"
              label={`Clients (${tabCount("clients")})`}
            />
            <Tab
              value="sub-accounts"
              icon={<IconUsers size={16} />}
              iconPosition="start"
              label={`Sous-comptes (${tabCount("sub-accounts")})`}
            />
          </Tabs>

          <Stack direction="row" spacing={1}>
            {tab === "admins" && (
              <Button
                variant="contained"
                size="small"
                startIcon={<IconPlus size={16} />}
                onClick={handleCreateAdmin}
                sx={{
                  bgcolor: BRAND_TEAL,
                  "&:hover": { bgcolor: "#3aa896" },
                }}
              >
                Nouvel admin
              </Button>
            )}
            {tab === "clients" && (
              <Button
                variant="contained"
                size="small"
                startIcon={<IconPlus size={16} />}
                onClick={() => router.push("/admin/create-client")}
                sx={{
                  bgcolor: BRAND_TEAL,
                  "&:hover": { bgcolor: "#3aa896" },
                }}
              >
                Nouveau client
              </Button>
            )}
            {tab === "sub-accounts" && (
              <Button
                variant="contained"
                size="small"
                startIcon={<IconPlus size={16} />}
                onClick={handleCreateSubAccount}
                disabled={clientsForParent.length === 0}
                sx={{
                  bgcolor: BRAND_TEAL,
                  "&:hover": { bgcolor: "#3aa896" },
                }}
              >
                Nouveau sous-compte
              </Button>
            )}
          </Stack>
        </Box>

        {loading && (
          <Box sx={{ p: 4, display: "grid", placeItems: "center" }}>
            <CircularProgress />
          </Box>
        )}
        {!loading && error && (
          <Box sx={{ p: 2 }}>
            <Alert severity="error">{error}</Alert>
          </Box>
        )}
        {!loading && !error && filteredUsers.length === 0 && (
          <Box sx={{ p: 4, textAlign: "center", color: TEXT_MUTED }}>
            <Typography variant="body2">Aucun compte dans cette categorie.</Typography>
          </Box>
        )}

        {!loading && !error && filteredUsers.length > 0 && (
          <Box>
            {filteredUsers.map((u, i) => (
              <Box
                key={u.id}
                sx={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  alignItems: "center",
                  gap: 2,
                  px: 2,
                  py: 1.5,
                  borderBottom:
                    i < filteredUsers.length - 1 ? "1px solid #f1f5f9" : "none",
                  transition: "background-color 0.15s",
                  "&:hover": { bgcolor: "rgba(var(--accent-rgb), 0.04)" },
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: TEXT_MAIN }}>
                      {u.name ?? "(sans nom)"}
                    </Typography>
                    <RoleChip role={u.role} />
                    {u.isSecretary && <Chip label="Secretaire" size="small" />}
                    {isSubAccount(u) && (
                      <Chip
                        label="Sous-compte"
                        size="small"
                        sx={{ bgcolor: "#F1F5F9", color: TEXT_MAIN }}
                      />
                    )}
                  </Stack>
                  <Typography variant="body2" sx={{ color: TEXT_MUTED, fontSize: 13 }}>
                    {u.email}
                    {u.manager && (
                      <>
                        {" · Rattache a "}
                        <Typography component="span" sx={{ color: TEXT_MAIN, fontWeight: 600, fontSize: 13 }}>
                          {u.manager.name ?? u.manager.email}
                        </Typography>
                      </>
                    )}
                    {u._count.userProducts > 0 && (
                      <> · {u._count.userProducts} produit{u._count.userProducts > 1 ? "s" : ""}</>
                    )}
                    {u._count.managedUsers > 0 && (
                      <> · {u._count.managedUsers} sous-compte{u._count.managedUsers > 1 ? "s" : ""}</>
                    )}
                  </Typography>
                </Box>
                <IconButton
                  size="small"
                  onClick={(e) => setMenuAnchor({ el: e.currentTarget, user: u })}
                  aria-label="Actions"
                >
                  <IconDots size={18} />
                </IconButton>
              </Box>
            ))}
          </Box>
        )}
      </Card>

      {/* Menu actions par ligne */}
      <Menu
        anchorEl={menuAnchor?.el ?? null}
        open={!!menuAnchor}
        onClose={handleCloseMenu}
      >
        {menuAnchor?.user &&
          isSubAccount(menuAnchor.user) && (
            <MenuItem onClick={handleEditPermissions}>
              <IconEdit size={16} style={{ marginRight: 8 }} />
              Editer permissions
            </MenuItem>
          )}
        <MenuItem onClick={handleKick}>
          <IconLogout size={16} style={{ marginRight: 8 }} />
          Deconnecter (kick)
        </MenuItem>
        <MenuItem onClick={handleDelete} sx={{ color: "#dc2626" }}>
          <IconTrash size={16} style={{ marginRight: 8 }} />
          Supprimer
        </MenuItem>
      </Menu>

      {/* Dialog creation */}
      <CreateAccountDialog
        open={createOpen}
        mode={createMode}
        clients={clientsForParent}
        onClose={() => setCreateOpen(false)}
        onSuccess={(msg) => {
          setCreateOpen(false);
          setSnack({ msg, kind: "success" });
          load();
        }}
      />

      {/* Dialog edition permissions */}
      <EditPermissionsDialog
        user={editingUser}
        onClose={() => setEditingUser(null)}
        onSuccess={(msg) => {
          setEditingUser(null);
          setSnack({ msg, kind: "success" });
          load();
        }}
      />

      <Snackbar
        open={!!snack}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          severity={snack?.kind ?? "success"}
          onClose={() => setSnack(null)}
          sx={{ width: "100%" }}
        >
          {snack?.msg}
        </Alert>
      </Snackbar>
    </PageContainer>
  );
}

function RoleChip({ role }: { role: ApiUser["role"] }) {
  const config = {
    SUPER_ADMIN: { label: "Super admin", bg: "#7c3aed", fg: "#fff" },
    ADMIN: { label: "Admin", bg: "#1F3448", fg: "#fff" },
    CLIENT: { label: "Client", bg: BRAND_TEAL, fg: "#fff" },
  }[role];
  return (
    <Chip
      label={config.label}
      size="small"
      sx={{
        bgcolor: config.bg,
        color: config.fg,
        fontWeight: 700,
        fontSize: 11,
        height: 20,
      }}
    />
  );
}
