import React from "react";
import { Box, Typography } from "@mui/material";

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) return null;

  const fullMonth = payload[0]?.payload?.fullMonth || label;

  return (
    <Box
      sx={{
        backgroundColor: "white",
        border: "1px solid #ccc",
        borderRadius: 1,
        p: 1,
        minWidth: 120,
      }}
    >
      <Typography variant="subtitle2" fontWeight={600} mb={0.5}>
        {fullMonth}
      </Typography>
      {payload.map((entry, index) => (
        <Typography key={index} fontSize={13} color={entry.color}>
          {entry.name}: <strong>{entry.value}</strong>
        </Typography>
      ))}
    </Box>
  );
};

export default CustomTooltip;
