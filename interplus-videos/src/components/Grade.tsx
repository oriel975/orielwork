import React, {useId} from 'react';
import {AbsoluteFill} from 'remotion';
import type {Grade} from '../engine/schema';

/** CSS filter applied to the picture itself for each grade. */
export const gradeFilter = (grade: Grade, thermalId: string): string => {
  switch (grade) {
    case 'warm':
      return 'contrast(1.06) saturate(1.08) sepia(0.06)';
    case 'cool':
      return 'contrast(1.05) saturate(0.88) hue-rotate(-6deg)';
    case 'night':
      return 'brightness(0.6) contrast(1.14) saturate(0.7)';
    case 'thermal':
      return `url(#${thermalId}) contrast(1.05)`;
    default:
      return 'contrast(1.05) saturate(1.02)';
  }
};

/**
 * Ironbow gradient map, the palette most thermal cameras use: luminance mapped
 * black → indigo → magenta → red → orange → yellow → white.
 */
export const ThermalFilterDefs: React.FC<{id: string}> = ({id}) => (
  <svg width={0} height={0} style={{position: 'absolute'}} aria-hidden>
    <filter id={id} colorInterpolationFilters="sRGB">
      <feColorMatrix
        type="matrix"
        values="0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0 0 0 1 0"
      />
      <feComponentTransfer>
        <feFuncR type="table" tableValues="0.02 0.22 0.55 0.86 0.99 1 1" />
        <feFuncG type="table" tableValues="0.01 0.02 0.06 0.24 0.55 0.84 0.98" />
        <feFuncB type="table" tableValues="0.12 0.42 0.55 0.28 0.06 0.18 0.85" />
      </feComponentTransfer>
    </filter>
  </svg>
);

export const useThermalId = () => `ip-thermal-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

/** Colour wash + vignette laid over the picture. */
export const GradeOverlay: React.FC<{grade: Grade; vignette?: number}> = ({grade, vignette = 0.55}) => {
  const wash: Record<Grade, string> = {
    neutral: 'linear-gradient(180deg, rgba(11,31,58,0.10) 0%, rgba(11,31,58,0) 40%, rgba(6,18,31,0.35) 100%)',
    warm: 'linear-gradient(180deg, rgba(255,176,32,0.10) 0%, rgba(255,140,40,0.04) 45%, rgba(6,18,31,0.40) 100%)',
    cool: 'linear-gradient(180deg, rgba(30,136,255,0.14) 0%, rgba(11,31,58,0.10) 50%, rgba(6,18,31,0.45) 100%)',
    night: 'linear-gradient(180deg, rgba(3,10,18,0.55) 0%, rgba(11,31,58,0.30) 50%, rgba(3,10,18,0.70) 100%)',
    thermal: 'linear-gradient(180deg, rgba(3,10,18,0.15) 0%, rgba(3,10,18,0) 40%, rgba(3,10,18,0.45) 100%)',
  };
  return (
    <>
      <AbsoluteFill style={{background: wash[grade]}} />
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 85% 80% at 50% 48%, transparent 55%, rgba(3,10,18,${vignette}) 100%)`,
        }}
      />
    </>
  );
};
