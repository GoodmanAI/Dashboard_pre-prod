import { Stack } from "@mui/material";
import { IconLock } from "@tabler/icons-react";
import { Bloc, EnTete, Ligne } from "@/pilot/components/Bloc";

/**
 * Un écran fermé à ce compte (C-64). Il dit pourquoi et à qui s'adresser :
 * personne ne doit deviner ce qui bloque.
 */
export function AccesRefuse({ titre, raison, suite }: { titre: string; raison: string; suite: string }) {
  return <Stack spacing={2.5} sx={{ maxWidth: 760 }}>
    <EnTete titre={titre} />
    <Bloc titre="Pas ouvert à votre compte" icone={IconLock} teinte="gris">
      <Ligne nom={raison} detail={suite} />
    </Bloc>
  </Stack>;
}
