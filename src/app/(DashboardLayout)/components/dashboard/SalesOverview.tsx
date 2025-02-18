"use client";

import React, { useEffect, useState } from "react";
import { Select, MenuItem, CircularProgress } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import DashboardCard from "@/app/(DashboardLayout)/components/shared/DashboardCard";
import dynamic from "next/dynamic";

// Chargement dynamique du graphique
const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

interface ChartData {
  date: string;
  products: Record<string, number>;
}

const SalesOverview = () => {
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState("all");

  useEffect(() => {
    const fetchChartData = async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/admin/overview");
        const data = await response.json();
        if (response.ok) {
          // Assurer que les données correspondent bien aux attentes
          const formattedData: ChartData[] = data.chartData.map((entry: any) => ({
            date: entry.date, // Correspond maintenant à la clé "date"
            products: entry.products || {}, // Assurer que les produits existent
          }));

          setChartData(formattedData);
        } else {
          console.error("Failed to fetch chart data:", data.error);
        }
      } catch (error) {
        console.error("Error fetching chart data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchChartData();
  }, []);

  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const secondary = theme.palette.secondary.main;

  // Extraire les noms des produits
  const productNames = Array.from(
    new Set(chartData.flatMap((entry) => Object.keys(entry.products)))
  );

  // Générer les catégories (dates)
  const categories: string[] = chartData.map((entry) => entry.date);

  // Structurer les données pour ApexCharts
  const seriesData = productNames.map((productName) => ({
    name: productName,
    data: chartData.map((entry) => entry.products[productName] || 0),
  }));

  // Configuration du graphique
  const chartOptions: ApexCharts.ApexOptions = {
    chart: {
      type: "bar",
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      foreColor: "#adb0bb",
      toolbar: {
        show: false, // Désactive la toolbar
      },
    },
    colors: [primary, secondary],
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: "42%",
        borderRadius: 6,
      },
    },
    stroke: {
      show: true,
      width: 2,
      colors: ["transparent"],
    },
    dataLabels: {
      enabled: false,
    },
    legend: {
      show: true,
    },
    grid: {
      borderColor: "rgba(0,0,0,0.1)",
      strokeDashArray: 3,
    },
    yaxis: {
      tickAmount: 4,
    },
    xaxis: {
      categories,
      axisBorder: {
        show: false,
      },
    },
    tooltip: {
      theme: "dark",
      fillSeriesColor: false,
    },
  };

  return (
    <DashboardCard
      title="Client Product Statistics"
      action={
        <Select
          labelId="period-select"
          id="period-select"
          value={selectedPeriod}
          size="small"
          onChange={(e) => setSelectedPeriod(e.target.value)}
          sx={{ marginRight: 2 }}
        >
          <MenuItem value="all">All Time</MenuItem>
          <MenuItem value="last7">Last 7 Days</MenuItem>
          <MenuItem value="last30">Last 30 Days</MenuItem>
        </Select>
      }
    >
      {loading ? (
        <CircularProgress />
      ) : (
        <Chart options={chartOptions} series={seriesData} type="bar" height={370} width="100%" />
      )}
    </DashboardCard>
  );
};

export default SalesOverview;
