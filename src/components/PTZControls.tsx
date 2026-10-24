import React from 'react';
import { ZoomIn, ZoomOut, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react';

interface PTZControlsProps {
  zoom: number;
  pan: number;
  tilt: number;
  onChange: (update: { zoom?: number; pan?: number; tilt?: number }) => void;
  onReset: () => void;
}

export const PTZControls: React.FC<PTZControlsProps> = ({
  zoom,
  pan,
  tilt,
  onChange,
  onReset,
}) => {
  return (
    <div className="p-3 bg-neutral-900/95 backdrop-blur-md rounded-xl border border-neutral-700/80 shadow-2xl text-xs text-neutral-200 w-52 select-none">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-neutral-800">
        <span className="font-semibold text-neutral-300">Controles PTZ Digital</span>
        <button
          onClick={onReset}
          title="Resetar enquadramento"
          className="p-1 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 rounded transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Zoom Control */}
      <div className="mb-3">
        <div className="flex justify-between items-center mb-1">
          <span className="text-neutral-400">Zoom Digital</span>
          <span className="font-mono tabular-nums text-neutral-200">{zoom.toFixed(1)}x</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onChange({ zoom: Math.max(1, Number((zoom - 0.2).toFixed(1))) })}
            disabled={zoom <= 1}
            className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-neutral-200"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <input
            type="range"
            min="1"
            max="3"
            step="0.1"
            value={zoom}
            onChange={(e) => onChange({ zoom: parseFloat(e.target.value) })}
            className="w-full accent-blue-500 h-1 bg-neutral-700 rounded-lg cursor-pointer"
          />
          <button
            onClick={() => onChange({ zoom: Math.min(3, Number((zoom + 0.2).toFixed(1))) })}
            disabled={zoom >= 3}
            className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-neutral-200"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Pan & Tilt Pad */}
      <div>
        <span className="block text-neutral-400 mb-1.5">Giro / Inclinação (Pan & Tilt)</span>
        <div className="grid grid-cols-3 gap-1 w-28 mx-auto">
          <div />
          <button
            onClick={() => onChange({ tilt: Math.min(40, tilt + 8) })}
            className="p-1.5 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200"
            title="Inclinar para cima"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <div />
          <button
            onClick={() => onChange({ pan: Math.min(40, pan + 8) })}
            className="p-1.5 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200"
            title="Pan esquerda"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <div className="flex items-center justify-center text-[10px] font-mono text-neutral-400">
            PTZ
          </div>
          <button
            onClick={() => onChange({ pan: Math.max(-40, pan - 8) })}
            className="p-1.5 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200"
            title="Pan direita"
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <div />
          <button
            onClick={() => onChange({ tilt: Math.max(-40, tilt - 8) })}
            className="p-1.5 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200"
            title="Inclinar para baixo"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <div />
        </div>
      </div>
    </div>
  );
};
