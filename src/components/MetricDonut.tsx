// components/MetricDonut.tsx
import React from 'react';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';

export interface MetricDonutProps {
  value: number | null;
  label: string;
  customSize?: number;
}

const labelColors: { [key: string]: string } = {
  "Moyenne": "#48C8AF",
  "Prise de RDV": "#299ED9",
  "Borne d'accueil": "#FBC739",
  "Prise en charge examen": "#65558F",
  "Prise en charge secrétaire": "#DB82D9",
  "Attente": "#F08041"
};

const MetricDonut: React.FC<MetricDonutProps> = ({ value, label, customSize }) => {
    const percentage = typeof value === 'number' ? value : 0;
    const color = labelColors[label] || '#757575';
    const textSize = typeof value === 'number' ? '16px' : '12px';
    const textContent = typeof value === 'number' ? `${value}/100` : 'Aucune data';

    const donutSize = customSize !== undefined ? customSize : 110;
  
    return (
      <div style={{ width: donutSize, height: donutSize, position: 'relative', margin: 'auto' }} className="metric-donut">
        <style>{`
        .metric-donut .CircularProgressbar-text {
          font-weight: bold;
        }
      `}</style>
        <CircularProgressbar
          value={percentage}
          text=""
          styles={buildStyles({
            pathColor: color,
            textColor: '#000000',
            trailColor: '#e3e3e3',
            strokeLinecap: 'butt',
          })}
        />
        <div
        style={{
          position: 'absolute',
          top: '40%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center'
        }}
      >
        {typeof value === 'number' ? (
          <>
            <span style={{ fontWeight: 'bold', fontSize: '16px', color: '#000000' }}>{value}</span>
            <span style={{ fontSize: '16px', color: '#000000' }}>/100</span>
          </>
        ) : (
          <span style={{ fontSize: '16px', color: '#000000' }}>Aucune data</span>
        )}
      </div>
        <div
          style={{
            position: 'absolute',
            top: '65%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: '12px',
            fontWeight: 'medium',
            whiteSpace: 'normal',
            textAlign: 'center',
            lineHeight: '0.9'
          }}
        >
          {label}
        </div>
      </div>
    );
  };

export default MetricDonut;
