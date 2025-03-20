// // components/MetricsPanel.tsx
// import React from 'react';
// import {
//   Box,
//   Typography,
//   Paper,
//   Grid,
//   Table,
//   TableBody,
//   TableCell,
//   TableContainer,
//   TableHead,
//   TableRow,
// } from '@mui/material';

// const labelColors: { [key: string]: string } = {
//   "Moyenne": "#48C8AF",
//   "Prise de RDV": "#299ED9",
//   "Borne d'accueil": "#FBC739",
//   "Prise en charge examen": "#65558F",
//   "Prise en charge secrétaire": "#DB82D9",
//   "Attente": "#F08041"
// };

// const MetricsTable: React.FC = () => {
//   const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
//   const metricsOrder = [
//     "Moyenne",
//     "Prise de RDV",
//     "Borne d'accueil",
//     "Prise en charge examen",
//     "Prise en charge secrétaire",
//     "Attente"
//   ];

//   // Génération de valeurs aléatoires pour les 5 métriques par mois,
//   // puis calcul de la Moyenne pour chaque mois.
//   const monthlyData = months.map((month) => {
//     const priseRDV = Math.floor(Math.random() * 101);
//     const borneAccueil = Math.floor(Math.random() * 101);
//     const priseExamen = Math.floor(Math.random() * 101);
//     const priseSecretaire = Math.floor(Math.random() * 101);
//     const attente = Math.floor(Math.random() * 101);
//     const moyenne = Math.round((priseRDV + borneAccueil + priseExamen + priseSecretaire + attente) / 5);
//     return {
//       month,
//       "Moyenne": moyenne,
//       "Prise de RDV": priseRDV,
//       "Borne d'accueil": borneAccueil,
//       "Prise en charge examen": priseExamen,
//       "Prise en charge secrétaire": priseSecretaire,
//       "Attente": attente,
//     };
//   });

//   return (
//     <TableContainer>
//       <Table size="small">
//         <TableHead>
//           <TableRow>
//             <TableCell sx={{ fontWeight: 500 }}>Metrics</TableCell>
//             {months.map((month) => (
//               <TableCell key={month} align="center">{month}</TableCell>
//             ))}
//           </TableRow>
//         </TableHead>
//         <TableBody>
//           {metricsOrder.map((metric) => (
//             <TableRow key={metric}>
//               <TableCell sx={{ fontWeight: 500 }}>{metric}</TableCell>
//               {monthlyData.map((data, idx) => (
//                 <TableCell key={idx} align="center">{data[metric]}</TableCell>
//               ))}
//             </TableRow>
//           ))}
//         </TableBody>
//       </Table>
//     </TableContainer>
//   );
// };

// const MetricsPanel: React.FC = () => {
//   return (
//     <Paper sx={{ p: 2, height: "350px", position: 'relative' }}>
//       {/* Header avec titre/sous-titre à gauche et sélections à droite */}
//       <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
//         <Box sx={{ textAlign: "left" }}>
//           <Typography variant="h4" sx={{ fontWeight: 600, mb: 0.5 }}>
//             Indicateurs de satisfaction
//           </Typography>
//           <Typography variant="subtitle2" color="text.secondary">
//             Sur le mois de <strong>Mars</strong>
//           </Typography>
//         </Box>
//         <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
//           <Typography variant="body1" sx={{ fontWeight: 500 }}>Daily</Typography>
//           <Typography variant="body1" sx={{ fontWeight: 500 }}>Weekly</Typography>
//           <Typography variant="body1" sx={{ fontWeight: 500, color: '#48C8AF' }}>Monthly</Typography>
//           <Typography variant="body1" sx={{ fontWeight: 500 }}>Yearly</Typography>
//         </Box>
//       </Box>
//       {/* Légende des couleurs */}
//       <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
//         {Object.entries(labelColors).map(([key, color]) => (
//           <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
//             <Box sx={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: color }} />
//             <Typography variant="caption" sx={{ fontWeight: 500 }}>{key}</Typography>
//           </Box>
//         ))}
//       </Box>
//       {/* Tableau des données mensuelles */}
//       <MetricsTable />
//     </Paper>
//   );
// };

// export default MetricsPanel;
