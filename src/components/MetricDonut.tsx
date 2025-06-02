import React from 'react';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { Tooltip } from '@mui/material';

export interface MetricDonutProps {
  value: number | null;
  label: string;
  tooltip?: string;
  type?: 'full' | 'half';
  customSize?: number;
  valueFontSize?: number;
}

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
  const percentage = typeof value === 'number' ? value : 0;
  const color = getColor(percentage);
  const rotation = type === 'half' ? 0.75 : 0;
  const cut = type === 'half' ? 0.5 : 1;

  return (
    <Tooltip title={tooltip || ""} arrow>
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
        cursor: tooltip ? 'help' : 'default', // met le curseur sur tout le bloc
      }}
      tabIndex={tooltip ? 0 : -1} // rendre focusable tout le bloc
    >
      {/* le reste du contenu */}
      <div
        style={{
          width: customSize,
          height: type === 'half' ? customSize / 2 : customSize,
          position: 'relative',
        }}
      >
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
