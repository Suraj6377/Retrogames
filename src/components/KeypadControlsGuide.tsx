import React from 'react';
import { NUMERIC_CONTROLS } from '../types';

export const KeypadControlsGuide: React.FC = () => {
  return (
    <div className="bg-black/80 text-white p-4 rounded-xl border border-white/10 text-xs font-mono">
      <h3 className="text-emerald-500 mb-2 uppercase tracking-widest">Keypad Controls</h3>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex justify-between"><span>UP</span> <span>{NUMERIC_CONTROLS.UP}</span></div>
        <div className="flex justify-between"><span>DOWN</span> <span>{NUMERIC_CONTROLS.DOWN}</span></div>
        <div className="flex justify-between"><span>LEFT</span> <span>{NUMERIC_CONTROLS.LEFT}</span></div>
        <div className="flex justify-between"><span>RIGHT</span> <span>{NUMERIC_CONTROLS.RIGHT}</span></div>
        <div className="flex justify-between"><span>A</span> <span>{NUMERIC_CONTROLS.A}</span></div>
        <div className="flex justify-between"><span>B</span> <span>{NUMERIC_CONTROLS.B}</span></div>
        <div className="flex justify-between"><span>START</span> <span>{NUMERIC_CONTROLS.START}</span></div>
        <div className="flex justify-between"><span>SELECT</span> <span>{NUMERIC_CONTROLS.SELECT}</span></div>
      </div>
    </div>
  );
};
