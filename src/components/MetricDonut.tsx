import React from 'react';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { Tooltip } from '@mui/material';

/**
 * Composant indicateur circulaire (plein ou demi-donut) pour afficher une métrique en pourcentage.
 *
 * Objectifs :
 * - Fournir une visualisation compacte d’une valeur (0–100) avec code couleur (rouge/orange/vert).
 * - Supporter deux modes d’affichage : cercle complet ("full") ou demi-cercle ("half").
 * - Exposer un libellé et un éventuel infobulle (tooltip) pour l’accessibilité et l’explicitation.
 *
 * Props :
 * - value        : nombre entre 0 et 100 (null pour valeur indisponible).
 * - label        : texte affiché sous l’indicateur.
 * - tooltip      : texte de l’infobulle au survol (optionnel).
 * - type         : "full" | "half" (par défaut "full").
 * - customSize   : diamètre (px) du donut (par défaut 110).
 * - valueFontSize: taille de police (px) pour la valeur (par défaut 14).
 */
export interface MetricDonutProps {
  value: number | null;
  label: string;
  tooltip?: string;
  type?: 'full' | 'half';
  customSize?: number;
  valueFontSize?: number;
}

/**
 * Détermine la couleur du tracé en fonction du pourcentage :
 * - < 35  : rouge (insuffisant)
 * - < 65  : orange (moyen)
 * - sinon : vert (bon)
 */
const getColor = (value: number): string => {
  if (value < 35) return '#e53935';
  if (value < 65) return '#fb8c00';
  return '#43a047';
};

const MetricDonut: React.FC<MetricDonutProps> = ({
  value,
  label,
  tooltip,
  type = 'full',
  customSize = 110,
  valueFontSize = 14
}) => {
  // Normalisation et calculs d’apparence selon le mode (plein / demi)
  const percentage = typeof value === 'number' ? value : 0;
  const color = getColor(percentage);
  const rotation = type === 'half' ? 0.75 : 0; // rotation pour démarrer en mode demi-cercle
  const cut = type === 'half' ? 0.5 : 1;       // ratio du cercle affiché

  return (
    // Infobulle optionnelle : améliore l’explicitation sans alourdir l’UI
    <Tooltip title={tooltip || ""} arrow>
      {/* Conteneur principal : gère l’alignement vertical selon le type d’affichage */}
      <div
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: type === 'half' ? 'flex-end' : 'center',
          paddingTop: type === 'half' ? '0' : '10px',
          paddingBottom: '14px',
          cursor: tooltip ? 'help' : 'default',
        }}
        tabIndex={tooltip ? 0 : -1}
      >
        {/* Zone du donut : dimensionnée par customSize et adaptée au mode demi-cercle */}
        <div
          style={{
            width: customSize,
            height: type === 'half' ? customSize / 2 : customSize,
            position: 'relative',
          }}
        >
          {/* Donut (react-circular-progressbar) configuré avec rotation et ratio */}
          <CircularProgressbar
            value={percentage}
            circleRatio={cut}
            styles={buildStyles({
              rotation,
              strokeLinecap: 'butt',
              pathColor: color,
              trailColor: '#e0e0e0',
            })}
          />

          {/* Valeur numérique centrée au-dessus du donut */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              fontSize: valueFontSize,
              fontWeight: 'bold',
            }}
          >
            {value !== null ? `${percentage}%` : 'N/A'}
          </div>
        </div>

        {/* Libellé descriptif de la métrique */}
        <span
          style={{
            marginTop: 8,
            fontSize: '15px',
            fontWeight: 600,
            textAlign: 'center',
            display: 'inline-block',
          }}
        >
          {label}
        </span>
      </div>
    </Tooltip>
  );
};

export default MetricDonut;
