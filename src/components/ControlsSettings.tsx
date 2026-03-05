import React, { useState, useEffect } from 'react';
import { ControlMapping, DEFAULT_CONTROLS, GamepadMapping, DEFAULT_GAMEPAD_CONTROLS } from '../types';
import { X, Keyboard, RotateCcw, Gamepad2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ControlsSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ControlsSettings: React.FC<ControlsSettingsProps> = ({ isOpen, onClose }) => {
  const [controls, setControls] = useState<ControlMapping>(DEFAULT_CONTROLS);
  const [gamepadControls, setGamepadControls] = useState<GamepadMapping>(DEFAULT_GAMEPAD_CONTROLS);
  const [activeKey, setActiveKey] = useState<keyof ControlMapping | null>(null);
  const [activeTab, setActiveTab] = useState<'keyboard' | 'gamepad'>('keyboard');

  useEffect(() => {
    const saved = localStorage.getItem('nes-controls');
    if (saved) {
      try {
        setControls(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load controls', e);
      }
    }

    const savedGamepad = localStorage.getItem('nes-gamepad-controls');
    if (savedGamepad) {
      try {
        setGamepadControls(JSON.parse(savedGamepad));
      } catch (e) {
        console.error('Failed to load gamepad controls', e);
      }
    }
  }, []);

  useEffect(() => {
    if (!activeKey || activeTab !== 'gamepad') return;

    let rafId: number;
    const pollGamepad = () => {
      const gamepads = navigator.getGamepads();
      for (const gp of gamepads) {
        if (!gp) continue;
        for (let i = 0; i < gp.buttons.length; i++) {
          if (gp.buttons[i].pressed) {
            const newGamepadControls = { ...gamepadControls, [activeKey]: i };
            setGamepadControls(newGamepadControls);
            localStorage.setItem('nes-gamepad-controls', JSON.stringify(newGamepadControls));
            window.dispatchEvent(new Event('nes-controls-changed'));
            setActiveKey(null);
            return;
          }
        }
      }
      rafId = requestAnimationFrame(pollGamepad);
    };

    rafId = requestAnimationFrame(pollGamepad);
    return () => cancelAnimationFrame(rafId);
  }, [activeKey, activeTab, gamepadControls]);

  const saveControls = (newControls: ControlMapping) => {
    setControls(newControls);
    localStorage.setItem('nes-controls', JSON.stringify(newControls));
    window.dispatchEvent(new Event('nes-controls-changed'));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!activeKey || activeTab !== 'keyboard') return;
    e.preventDefault();
    
    // Don't allow Escape as a mapped key (used for closing)
    if (e.key === 'Escape') {
      setActiveKey(null);
      return;
    }

    const newControls = { ...controls, [activeKey]: e.key };
    saveControls(newControls);
    setActiveKey(null);
  };

  const resetControls = () => {
    if (activeTab === 'keyboard') {
      saveControls(DEFAULT_CONTROLS);
    } else {
      setGamepadControls(DEFAULT_GAMEPAD_CONTROLS);
      localStorage.setItem('nes-gamepad-controls', JSON.stringify(DEFAULT_GAMEPAD_CONTROLS));
      window.dispatchEvent(new Event('nes-controls-changed'));
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />
          
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-lg bg-[#151619] border border-white/10 rounded-[24px] sm:rounded-[32px] overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto"
            onKeyDown={handleKeyDown}
            tabIndex={0}
          >
            <div className="p-6 sm:p-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                    {activeTab === 'keyboard' ? <Keyboard size={20} /> : <Gamepad2 size={20} />}
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-white">Input Mapping</h2>
                    <p className="text-[10px] text-white/30 font-mono uppercase tracking-widest">{activeTab === 'keyboard' ? 'Keyboard Config' : 'Gamepad Config'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-white/5 p-1 rounded-xl self-start sm:self-auto">
                  <button 
                    onClick={() => setActiveTab('keyboard')}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-widest transition-all ${activeTab === 'keyboard' ? 'bg-white text-black font-bold' : 'text-white/40 hover:text-white'}`}
                  >
                    Keyboard
                  </button>
                  <button 
                    onClick={() => setActiveTab('gamepad')}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-widest transition-all ${activeTab === 'gamepad' ? 'bg-white text-black font-bold' : 'text-white/40 hover:text-white'}`}
                  >
                    Gamepad
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                {(Object.keys(controls) as Array<keyof ControlMapping>).map((key) => (
                  <button
                    key={key}
                    onClick={() => setActiveKey(key)}
                    className={`
                      flex flex-col items-start p-3 sm:p-4 rounded-xl sm:rounded-2xl border transition-all text-left
                      ${activeKey === key 
                        ? 'bg-emerald-500 border-emerald-400 text-black' 
                        : 'bg-white/5 border-white/5 text-white hover:border-white/20'
                      }
                    `}
                  >
                    <span className={`text-[9px] sm:text-[10px] font-mono uppercase tracking-widest mb-1 ${activeKey === key ? 'text-black/60' : 'text-white/30'}`}>
                      {key}
                    </span>
                    <span className="text-xs sm:text-sm font-bold truncate w-full">
                      {activeKey === key 
                        ? (activeTab === 'keyboard' ? 'PRESS KEY...' : 'PRESS BTN...') 
                        : (activeTab === 'keyboard' ? controls[key].toUpperCase() : `BTN ${gamepadControls[key] ?? 'NONE'}`)
                      }
                    </span>
                  </button>
                ))}
              </div>

              <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 sm:pt-8 border-t border-white/5">
                <button 
                  onClick={resetControls}
                  className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-white/30 hover:text-white transition-colors"
                >
                  <RotateCcw size={14} />
                  Reset to Default
                </button>
                <button 
                  onClick={onClose}
                  className="w-full sm:w-auto px-6 py-3 bg-white text-black rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-emerald-500 transition-all"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
