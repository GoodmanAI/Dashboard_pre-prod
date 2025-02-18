"use client";

import { useState } from "react";
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Paper,
} from "@mui/material";
import ModifyClientProducts from "@/components/ModifyClientProducts";
import ResetClientPassword from "@/components/ResetClientPassword";

export default function ManageClientsPage() {
  const [currentTab, setCurrentTab] = useState(0);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  return (
    <Box
      sx={{
        maxWidth: "800px",
        margin: "auto",
        p: 4,
        backgroundColor: "white",
        boxShadow: 3,
        borderRadius: 2,
      }}
    >
      <Typography fontWeight="700" variant="h4" textAlign="center" mb={2}>
        Manage Clients
      </Typography>

      <Paper elevation={2} sx={{ mb: 2 }}>
        <Tabs
          value={currentTab}
          onChange={handleTabChange}
          indicatorColor="primary"
          textColor="primary"
          centered
        >
          <Tab label="Modify Client Products" />
          <Tab label="Reset Password" />
        </Tabs>
      </Paper>

      <Box mt={4}>
        {currentTab === 0 ? <ModifyClientProducts /> : <ResetClientPassword />}
      </Box>
    </Box>
  );
}
