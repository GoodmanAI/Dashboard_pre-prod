// components/Profile.tsx
"use client";

import React, { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Avatar,
  Box,
  Menu,
  Button,
  IconButton,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import { IconListCheck, IconMail, IconUser } from "@tabler/icons-react";

const Profile = () => {
  const { data: session } = useSession();
  const [anchorEl2, setAnchorEl2] = useState<null | HTMLElement>(null);
  const router = useRouter();

  const handleClick2 = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl2(event.currentTarget);
  };

  const handleClose2 = () => {
    setAnchorEl2(null);
  };

  const handleLogout = async () => {
    setAnchorEl2(null);
    await signOut({
      callbackUrl: "/authentication/signin",
    });
  };

  const handleMyProfile = () => {
    if (session?.user?.role === "ADMIN") {
      router.push("/admin");
    } else {
      router.push("/client/profile");
    }
    handleClose2();
  };

  return (
    <Box>
      <IconButton
        size="large"
        aria-label="profile options"
        color="inherit"
        aria-controls="msgs-menu"
        aria-haspopup="true"
        onClick={handleClick2}
        sx={{
          ...(typeof anchorEl2 === "object" && {
            color: "primary.main",
          }),
        }}
      >
        <Avatar
          src="/images/logos/neuracorp-ai-icon_fond.png"
          alt="User Avatar"
          sx={{ width: 35, height: 35 }}
        />
      </IconButton>
      <Menu
        id="msgs-menu"
        anchorEl={anchorEl2}
        keepMounted
        open={Boolean(anchorEl2)}
        onClose={handleClose2}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        sx={{
          "& .MuiMenu-paper": { width: "200px" },
        }}
      >
        <MenuItem onClick={handleMyProfile}>
          <ListItemIcon>
            <IconUser width={20} />
          </ListItemIcon>
          <ListItemText primary="My Profile" />
        </MenuItem>
        <Box mt={1} py={1} px={2}>
          <Button variant="outlined" sx={{color: '#48C8AF',borderColor: '#48C8AF','&:hover': {backgroundColor: 'rgba(72,200,175,0.04)', borderColor: '#48C8AF'}}} onClick={handleLogout} fullWidth>
            Logout
          </Button>
        </Box>
      </Menu>
    </Box>
  );
};

export default Profile;
