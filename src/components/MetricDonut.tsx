// components/MetricDonut.tsx
import React from 'react';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';

interface MetricDonutProps {
  value: number | null;
  label: string;
}

const getColor = (value: number): string => {
  if (value < 20) return '#F94144';         // Rouge
  else if (value < 39) return '#F8961E';    // Orange
  else if (value < 59) return '#F9C74F';    // Jaune
  else if (value < 79) return '#90BE6D';    // Vert clair
  else return '#4D908E';                    // Vert foncé
};

const MetricDonut: React.FC<MetricDonutProps> = ({ value, label }) => {
    const percentage = typeof value === 'number' ? value : 0;
    const color = typeof value === 'number' ? getColor(value) : '#757575';
    const textSize = typeof value === 'number' ? '16px' : '12px';
    const textContent = typeof value === 'number' ? `${value}/100` : 'Aucune data';
  
    return (
      <div style={{ width: 130, height: 130, margin: 'auto' }}>
        <CircularProgressbar
          value={percentage}
          text={textContent}
          styles={buildStyles({
            pathColor: color,
            textColor: color,
            trailColor: '#f0f0f0',
            textSize: textSize,
          })}
        />
        <div style={{ textAlign: 'center', marginTop: 8, fontWeight: 600 }}>
          {label}
        </div>
      </div>
    );
  };

export default MetricDonut;
