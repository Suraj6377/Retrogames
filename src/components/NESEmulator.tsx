import React, { useEffect, useRef, useState } from 'react';
import { NES, Controller } from 'jsnes';
import { GameROM, ControlMapping, DEFAULT_CONTROLS, NUMERIC_CONTROLS, GamepadMapping, DEFAULT_GAMEPAD_CONTROLS } from '../types';
import { saveROM, saveGameState, getGameState } from '../db';
import { Maximize2, Minimize2, Play, Pause, RotateCcw, Volume2, VolumeX, Smartphone, X, Save, Download, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Theme } from '../theme';
import { VirtualControls } from './VirtualControls';
import { KeypadControlsGuide } from './KeypadControlsGuide';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface NESEmulatorProps {
  rom: GameROM;
  onClose: () => void;
  theme: Theme;
}

const SCREEN_WIDTH = 256;
const SCREEN_HEIGHT = 240;

export const NESEmulator: React.FC<NESEmulatorProps> = ({ rom, onClose, theme }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nesRef = useRef<NES | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const isPlayingRef = useRef(true);
  const isMutedRef = useRef(false);
  const volumeRef = useRef(0.5);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<any>(null);
  const requestRef = useRef<number | null>(null);
  
  // Device detection
  const [isTouchDevice] = useState(() => 'ontouchstart' in window || navigator.maxTouchPoints > 0);
  const [isKeypadDevice] = useState(() => /KaiOS|KAIOS|J2ME|MIDP|Opera Mini|Nokia|Samsung|LG/i.test(navigator.userAgent));
  const [showVirtualControls, setShowVirtualControls] = useState(isTouchDevice || isKeypadDevice);

  // Initialize controls from localStorage immediately to avoid double-render
  const [controls, setControls] = useState<ControlMapping>(() => {
    const saved = localStorage.getItem('nes-controls');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to load controls', e);
      }
    }
    // If it's a keypad device, use numeric controls by default
    return isKeypadDevice ? NUMERIC_CONTROLS : DEFAULT_CONTROLS;
  });
  
  const [gamepadControls, setGamepadControls] = useState<GamepadMapping>(() => {
    const saved = localStorage.getItem('nes-gamepad-controls');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to load gamepad controls', e);
      }
    }
    return DEFAULT_GAMEPAD_CONTROLS;
  });
  
  const controlsRef = useRef<ControlMapping>(controls);
  const gamepadControlsRef = useRef<GamepadMapping>(gamepadControls);
  const keysDownRef = useRef<Set<string>>(new Set());
  const crashCountRef = useRef(0);

  const startAudio = React.useCallback(() => {
    if (audioCtxRef.current) return;
    try {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const scriptNode = audioCtxRef.current.createScriptProcessor(4096, 0, 2);
      scriptNode.onaudioprocess = (e) => {
        const left = e.outputBuffer.getChannelData(0);
        const right = e.outputBuffer.getChannelData(1);
        if (audioBufferRef.current) {
          audioBufferRef.current.readSamples(left, right);
        }
      };
      scriptNode.connect(audioCtxRef.current.destination);
    } catch (e) {
      console.warn('Audio initialization failed', e);
    }
  }, []);

  // Sync refs with state
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);

  useEffect(() => {
    gamepadControlsRef.current = gamepadControls;
  }, [gamepadControls]);

  useEffect(() => {
    const handleChanged = () => {
      const saved = localStorage.getItem('nes-controls');
      if (saved) {
        try {
          setControls(JSON.parse(saved));
        } catch (e) {}
      }
      const savedGamepad = localStorage.getItem('nes-gamepad-controls');
      if (savedGamepad) {
        try {
          setGamepadControls(JSON.parse(savedGamepad));
        } catch (e) {}
      }
    };
    window.addEventListener('nes-controls-changed', handleChanged);
    return () => window.removeEventListener('nes-controls-changed', handleChanged);
  }, []);

  useEffect(() => {
    // Auto-launch fullscreen
    if (canvasRef.current && !isFullscreen) {
      canvasRef.current.requestFullscreen().catch(() => {
        // Fullscreen might be blocked by browser if not triggered by user interaction
        // But since onPlay is a user interaction, it should work
      });
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (rom.type === 'nes') {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const imageData = ctx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
      const buf = new Uint32Array(imageData.data.buffer);

      // Initialize JSNES
      const nes = new NES({
        onFrame: (frameBuffer: any) => {
          for (let i = 0; i < 256 * 240; i++) {
            buf[i] = 0xFF000000 | frameBuffer[i];
          }
          ctx.putImageData(imageData, 0, 0);
        },
        onAudioSample: (left: number, right: number) => {
          if (isMutedRef.current || !audioBufferRef.current) return;
          const vol = volumeRef.current;
          audioBufferRef.current.pushSample(left * vol, right * vol);
        },
      });
      console.log('NES initialized');

      nesRef.current = nes;

      // Load ROM using a robust method
      try {
        // Ensure we have data
        if (!rom.data || (rom.data instanceof Uint8Array ? rom.data.length : (rom.data as any).byteLength) === 0) {
          throw new Error('ROM data is empty');
        }
        
        // Ensure data is Uint8Array for header validation
        const data = rom.data instanceof Uint8Array ? rom.data : new Uint8Array(rom.data);
        
        // Validate NES Header (N E S \x1a)
        if (data[0] !== 0x4E || data[1] !== 0x45 || data[2] !== 0x53 || data[3] !== 0x1A) {
          console.error('Invalid Header Bytes:', data[0], data[1], data[2], data[3]);
          throw new Error('Invalid header: Not a valid NES ROM.');
        }
        
        const mapper = (data[7] & 0xF0) | ((data[6] & 0xF0) >> 4);
        console.log('Mapper:', mapper);
        
        // JSNES expects a binary string.
        const romString = Array.from(data as Uint8Array).map(byte => String.fromCharCode(byte)).join('');
        
        console.log('Loading ROM, length:', data.length);
        nes.reset();
        console.log('Calling nes.loadROM');
        try {
          nes.loadROM(romString);
          setIsLoading(false);
        } catch (e) {
          if (e instanceof Error && e.message.includes('mapper')) {
            throw new Error(`Unsupported mapper: This ROM uses an unsupported mapper (${mapper}).`);
          }
          throw e;
        }
        console.log('ROM loaded');
      } catch (e) {
        setIsLoading(false);
        console.error('Failed to load ROM:', e);
        if (e instanceof Error) console.error('Stack trace:', e.stack);
        const errorMsg = e instanceof Error ? e.message : 'Invalid ROM file or corrupted data.';
        setError(errorMsg);
        return;
      }
    }

    // Audio Setup - Improved Buffering
    const AudioProcessor = () => {
      const BUFFER_SIZE = 8192; // Larger buffer for stability
      const samples = new Float32Array(BUFFER_SIZE * 2);
      let head = 0;
      let tail = 0;

      return {
        pushSample: (left: number, right: number) => {
          samples[head] = left;
          samples[head + 1] = right;
          head = (head + 2) % (BUFFER_SIZE * 2);
          
          // If head catches tail, move tail forward (drop oldest samples)
          if (head === tail) {
            tail = (tail + 2) % (BUFFER_SIZE * 2);
          }
        },
        readSamples: (outLeft: Float32Array, outRight: Float32Array) => {
          for (let i = 0; i < outLeft.length; i++) {
            if (head !== tail) {
              outLeft[i] = samples[tail];
              outRight[i] = samples[tail + 1];
              tail = (tail + 2) % (BUFFER_SIZE * 2);
            } else {
              // Smooth out silence if buffer is empty
              outLeft[i] = 0;
              outRight[i] = 0;
            }
          }
        }
      };
    };

    audioBufferRef.current = AudioProcessor();

    const handleKeyDown = (e: KeyboardEvent) => {
      const player = 1;
      const key = e.key;
      keysDownRef.current.add(key);
      const currentControls = controlsRef.current;
      
      if (rom.type === 'nes' && nesRef.current) {
        const nes = nesRef.current;
        if (key === currentControls.UP || key === NUMERIC_CONTROLS.UP) nes.buttonDown(player, Controller.BUTTON_UP);
        else if (key === currentControls.DOWN || key === NUMERIC_CONTROLS.DOWN) nes.buttonDown(player, Controller.BUTTON_DOWN);
        else if (key === currentControls.LEFT || key === NUMERIC_CONTROLS.LEFT) nes.buttonDown(player, Controller.BUTTON_LEFT);
        else if (key === currentControls.RIGHT || key === NUMERIC_CONTROLS.RIGHT) nes.buttonDown(player, Controller.BUTTON_RIGHT);
        else if (key === currentControls.A || key === NUMERIC_CONTROLS.A) nes.buttonDown(player, Controller.BUTTON_A);
        else if (key === currentControls.B || key === NUMERIC_CONTROLS.B) nes.buttonDown(player, Controller.BUTTON_B);
        else if (key === currentControls.START || key === NUMERIC_CONTROLS.START) nes.buttonDown(player, Controller.BUTTON_START);
        else if (key === currentControls.SELECT || key === NUMERIC_CONTROLS.SELECT) nes.buttonDown(player, Controller.BUTTON_SELECT);
      }
      
      startAudio();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const player = 1;
      const key = e.key;
      keysDownRef.current.delete(key);
      const currentControls = controlsRef.current;
      
      if (rom.type === 'nes' && nesRef.current) {
        const nes = nesRef.current;
        if (key === currentControls.UP || key === NUMERIC_CONTROLS.UP) nes.buttonUp(player, Controller.BUTTON_UP);
        else if (key === currentControls.DOWN || key === NUMERIC_CONTROLS.DOWN) nes.buttonUp(player, Controller.BUTTON_DOWN);
        else if (key === currentControls.LEFT || key === NUMERIC_CONTROLS.LEFT) nes.buttonUp(player, Controller.BUTTON_LEFT);
        else if (key === currentControls.RIGHT || key === NUMERIC_CONTROLS.RIGHT) nes.buttonUp(player, Controller.BUTTON_RIGHT);
        else if (key === currentControls.A || key === NUMERIC_CONTROLS.A) nes.buttonUp(player, Controller.BUTTON_A);
        else if (key === currentControls.B || key === NUMERIC_CONTROLS.B) nes.buttonUp(player, Controller.BUTTON_B);
        else if (key === currentControls.START || key === NUMERIC_CONTROLS.START) nes.buttonUp(player, Controller.BUTTON_START);
        else if (key === currentControls.SELECT || key === NUMERIC_CONTROLS.SELECT) nes.buttonUp(player, Controller.BUTTON_SELECT);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    const loop = () => {
      if (isPlayingRef.current) {
        // Poll Gamepads
        const gamepads = navigator.getGamepads();
        const gp = gamepads[0]; // Use first gamepad
        if (gp) {
          const player = 1;
          const gControls = gamepadControlsRef.current;
          const kControls = controlsRef.current;
          const keysDown = keysDownRef.current;
          
          const isPressed = (btnIndex: number | null, k1: string, k2: string) => {
            const gpPressed = btnIndex !== null && gp.buttons[btnIndex]?.pressed;
            const kbPressed = keysDown.has(k1) || keysDown.has(k2);
            return gpPressed || kbPressed;
          };

          if (rom.type === 'nes' && nesRef.current) {
            const nes = nesRef.current;
            if (isPressed(gControls.UP, kControls.UP, NUMERIC_CONTROLS.UP)) nes.buttonDown(player, Controller.BUTTON_UP); else nes.buttonUp(player, Controller.BUTTON_UP);
            if (isPressed(gControls.DOWN, kControls.DOWN, NUMERIC_CONTROLS.DOWN)) nes.buttonDown(player, Controller.BUTTON_DOWN); else nes.buttonUp(player, Controller.BUTTON_DOWN);
            if (isPressed(gControls.LEFT, kControls.LEFT, NUMERIC_CONTROLS.LEFT)) nes.buttonDown(player, Controller.BUTTON_LEFT); else nes.buttonUp(player, Controller.BUTTON_LEFT);
            if (isPressed(gControls.RIGHT, kControls.RIGHT, NUMERIC_CONTROLS.RIGHT)) nes.buttonDown(player, Controller.BUTTON_RIGHT); else nes.buttonUp(player, Controller.BUTTON_RIGHT);
            if (isPressed(gControls.A, kControls.A, NUMERIC_CONTROLS.A)) nes.buttonDown(player, Controller.BUTTON_A); else nes.buttonUp(player, Controller.BUTTON_A);
            if (isPressed(gControls.B, kControls.B, NUMERIC_CONTROLS.B)) nes.buttonDown(player, Controller.BUTTON_B); else nes.buttonUp(player, Controller.BUTTON_B);
            if (isPressed(gControls.START, kControls.START, NUMERIC_CONTROLS.START)) nes.buttonDown(player, Controller.BUTTON_START); else nes.buttonUp(player, Controller.BUTTON_START);
            if (isPressed(gControls.SELECT, kControls.SELECT, NUMERIC_CONTROLS.SELECT)) nes.buttonDown(player, Controller.BUTTON_SELECT); else nes.buttonUp(player, Controller.BUTTON_SELECT);
          }
          
          if (gp.buttons.some(b => b.pressed)) startAudio();
        }

        try {
          if (rom.type === 'nes' && nesRef.current) {
            console.log('Executing frame');
            nesRef.current.frame();
          }
        } catch (e) {
          console.error('Emulator Frame Error:', e);
          if (e instanceof Error && e.message.includes('invalid opcode')) {
            crashCountRef.current++;
            if (crashCountRef.current < 3) {
              // Try to reset the emulator instead of closing it
              nesRef.current?.reset();
              showNotification(`Game encountered an error (invalid opcode). Resetting... (Attempt ${crashCountRef.current}/3)`, 'error');
              console.log('Emulator reset after crash, attempt', crashCountRef.current);
            } else {
              cancelAnimationFrame(requestRef.current!);
              setError('Game crashed too many times due to an invalid opcode. This ROM might be incompatible or corrupted.');
            }
          }
        }
      }
      requestRef.current = requestAnimationFrame(loop);
    };
    requestRef.current = requestAnimationFrame(loop);

    return () => {
      // Capture thumbnail on exit
      captureThumbnail();
      
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
      nesRef.current = null;
    };
  }, [rom, onClose]);

  const captureThumbnail = () => {
    if (canvasRef.current) {
      const thumbnail = canvasRef.current.toDataURL('image/jpeg', 0.5);
      saveROM({ ...rom, thumbnail });
    }
  };

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      containerRef.current?.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleReset = () => {
    setIsLoading(true);
    nesRef.current?.reset();
    setTimeout(() => setIsLoading(false), 500);
  };

  const handleSaveState = async () => {
    console.log('handleSaveState called, nesRef.current:', nesRef.current);
    if (!nesRef.current || !rom.id) {
      console.log('handleSaveState: nesRef.current or rom.id missing');
      return;
    }
    try {
      const state = nesRef.current?.toJSON();
      if (!state) throw new Error('Failed to get emulator state');
      await saveGameState(rom.id, state);
      showNotification('Game state saved successfully!');
    } catch (error) {
      console.error('Failed to save state:', error);
      showNotification('Failed to save game state', 'error');
    }
  };

  const handleLoadState = async () => {
    console.log('handleLoadState called, nesRef.current:', nesRef.current);
    if (!nesRef.current || !rom.id) {
      console.log('handleLoadState: nesRef.current or rom.id missing');
      return;
    }
    try {
      const saved = await getGameState(rom.id);
      if (saved && saved.state) {
        if (!nesRef.current) throw new Error('Emulator not initialized');
        nesRef.current.fromJSON(saved.state);
        showNotification('Game state loaded successfully!');
      } else {
        showNotification('No saved state found for this game', 'error');
      }
    } catch (error) {
      console.error('Failed to load state:', error);
      showNotification('Failed to load game state', 'error');
    }
  };

  const formatKey = (key: string) => {
    if (key.startsWith('Arrow')) return key.replace('Arrow', '').toUpperCase();
    if (key === ' ') return 'SPACE';
    return key.toUpperCase();
  };

  return (
    <div 
      ref={containerRef}
      className={cn(
        "fixed inset-0 bg-[#050505] z-50 flex flex-col items-center justify-center p-4",
        isFullscreen && "p-0"
      )}
    >
      {/* Error Display */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-[100] p-6">
          <div className="bg-red-900/20 border border-red-500/30 p-8 rounded-2xl max-w-md text-center">
            <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Failed to load ROM</h2>
            <p className="text-red-300 mb-6">{error}</p>
            <button 
              onClick={onClose}
              className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-all"
            >
              Return to Library
            </button>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-[100]">
          <div className="text-white text-xl font-bold animate-pulse">Loading Game...</div>
        </div>
      )}

      {/* Notifications */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className={cn(
              "fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl backdrop-blur-xl border flex items-center gap-3",
              notification.type === 'success' 
                ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400" 
                : "bg-red-500/20 border-red-500/30 text-red-400"
            )}
          >
            {notification.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            <span className="text-sm font-bold tracking-tight">{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Persistent Exit Button - Always Visible */}
      <button 
        onClick={onClose}
        className="fixed top-6 right-6 z-[70] p-4 bg-red-600/20 hover:bg-red-600 text-red-500 hover:text-white border border-red-500/30 rounded-2xl transition-all active:scale-95 group flex items-center gap-3 shadow-2xl backdrop-blur-xl"
        title="Exit to Library"
      >
        <X size={20} className="group-hover:rotate-90 transition-transform duration-300" />
        <span className="text-xs font-black uppercase tracking-[0.2em] hidden sm:inline">Exit to Library</span>
      </button>

      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={cn(
          "relative group w-full max-w-3xl aspect-[256/240] rounded-xl overflow-hidden shadow-2xl border border-white/10",
          theme.bg.replace('bg-', 'bg-'),
          isFullscreen && "max-w-none h-full rounded-none border-0"
        )}
      >
        <canvas
          ref={canvasRef}
          width={SCREEN_WIDTH}
          height={SCREEN_HEIGHT}
          className="w-full h-full object-contain image-render-pixel"
          style={{ imageRendering: 'pixelated' }}
        />
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.2)_50%)] bg-[length:100%_2px]" />

        {/* Overlay Controls */}
        <div className={cn(
          "absolute left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-300 z-20",
          isFullscreen ? "top-0 bg-gradient-to-b" : "bottom-0",
          !isFullscreen ? "opacity-0 group-hover:opacity-100" : "opacity-100"
        )}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => {
                  if (isPlaying) captureThumbnail();
                  setIsPlaying(!isPlaying);
                }}
                className="p-2 hover:bg-white/10 rounded-full transition-colors text-white"
              >
                {isPlaying ? <Pause size={24} /> : <Play size={24} />}
              </button>
              <button 
                onClick={handleReset}
                className="p-2 hover:bg-white/10 rounded-full transition-colors text-white"
              >
                <RotateCcw size={24} />
              </button>
              <div className="flex items-center gap-2 group/volume">
                <button 
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors text-white"
                >
                  {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
                </button>
                <input 
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  onChange={(e) => {
                    setVolume(parseFloat(e.target.value));
                    if (isMuted) setIsMuted(false);
                  }}
                  className={cn(
                    "w-0 group-hover/volume:w-24 transition-all duration-300 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer overflow-hidden",
                    `accent-${theme.accent}`
                  )}
                />
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={handleSaveState}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors text-white flex items-center gap-2 group/save"
                  title="Save State"
                >
                  <Save size={24} />
                  <span className="text-[10px] font-bold hidden group-hover/save:inline">SAVE</span>
                </button>
                <button 
                  onClick={handleLoadState}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors text-white flex items-center gap-2 group/load"
                  title="Load State"
                >
                  <Download size={24} />
                  <span className="text-[10px] font-bold hidden group-hover/load:inline">LOAD</span>
                </button>
              </div>
              {isTouchDevice && (
                <button 
                  onClick={() => setShowVirtualControls(!showVirtualControls)}
                  className={cn(
                    "p-2 rounded-full transition-colors",
                    showVirtualControls ? 'bg-white/20 text-white' : 'hover:bg-white/10 text-white/60'
                  )}
                >
                  <Smartphone size={24} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-4">
              <span className="text-xs font-mono text-white/50 uppercase tracking-widest hidden sm:inline">
                {rom.name}
              </span>
              <button 
                onClick={toggleFullscreen}
                className="p-2 hover:bg-white/10 rounded-full transition-colors text-white"
              >
                {isFullscreen ? <Minimize2 size={24} /> : <Maximize2 size={24} />}
              </button>
              <button 
                onClick={onClose}
                className="px-4 sm:px-6 py-2 sm:py-3 bg-red-600 hover:bg-red-500 text-white text-[10px] sm:text-xs font-black rounded-xl transition-all shadow-lg shadow-red-600/40 uppercase tracking-widest flex items-center gap-2"
              >
                <X size={16} />
                <span>Exit</span>
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Controls */}
      <AnimatePresence>
        {showVirtualControls && (
          <div className={cn(
            "w-full max-w-3xl mt-auto pb-8 z-[60]",
            isFullscreen && "absolute bottom-0 left-0 right-0 max-w-none px-4 pb-12"
          )}>
            {isKeypadDevice ? (
              <KeypadControlsGuide />
            ) : (
              <VirtualControls 
                onButtonDown={(btn) => {
                  const player = 1;
                  startAudio();
                  if (nesRef.current) {
                    const nes = nesRef.current;
                    if (btn === 'UP') nes.buttonDown(player, Controller.BUTTON_UP);
                    if (btn === 'DOWN') nes.buttonDown(player, Controller.BUTTON_DOWN);
                    if (btn === 'LEFT') nes.buttonDown(player, Controller.BUTTON_LEFT);
                    if (btn === 'RIGHT') nes.buttonDown(player, Controller.BUTTON_RIGHT);
                    if (btn === 'A') nes.buttonDown(player, Controller.BUTTON_A);
                    if (btn === 'B') nes.buttonDown(player, Controller.BUTTON_B);
                    if (btn === 'START') nes.buttonDown(player, Controller.BUTTON_START);
                    if (btn === 'SELECT') nes.buttonDown(player, Controller.BUTTON_SELECT);
                  }
                }}
                onButtonUp={(btn) => {
                  const player = 1;
                  if (nesRef.current) {
                    const nes = nesRef.current;
                    if (btn === 'UP') nes.buttonUp(player, Controller.BUTTON_UP);
                    if (btn === 'DOWN') nes.buttonUp(player, Controller.BUTTON_DOWN);
                    if (btn === 'LEFT') nes.buttonUp(player, Controller.BUTTON_LEFT);
                    if (btn === 'RIGHT') nes.buttonUp(player, Controller.BUTTON_RIGHT);
                    if (btn === 'A') nes.buttonUp(player, Controller.BUTTON_A);
                    if (btn === 'B') nes.buttonUp(player, Controller.BUTTON_B);
                    if (btn === 'START') nes.buttonUp(player, Controller.BUTTON_START);
                    if (btn === 'SELECT') nes.buttonUp(player, Controller.BUTTON_SELECT);
                  }
                }}
              />
            )}
          </div>
        )}
      </AnimatePresence>

      {/* Controls Guide */}
      {!isFullscreen && (
        <div className="mt-8 grid grid-cols-2 gap-12 text-white/40 font-mono text-[10px] uppercase tracking-widest">
          <div className="space-y-2">
            <p className="text-white/60 mb-4 border-b border-white/10 pb-2">Movement</p>
            <div className="flex justify-between"><span>UP / DOWN</span> <span>{formatKey(controls.UP)} / {formatKey(controls.DOWN)}</span></div>
            <div className="flex justify-between"><span>LEFT / RIGHT</span> <span>{formatKey(controls.LEFT)} / {formatKey(controls.RIGHT)}</span></div>
          </div>
          <div className="space-y-2">
            <p className="text-white/60 mb-4 border-b border-white/10 pb-2">Actions</p>
            <div className="flex justify-between"><span>A / B</span> <span>{formatKey(controls.A)} / {formatKey(controls.B)}</span></div>
            <div className="flex justify-between"><span>START</span> <span>{formatKey(controls.START)}</span></div>
            <div className="flex justify-between"><span>SELECT</span> <span>{formatKey(controls.SELECT)}</span></div>
          </div>
        </div>
      )}
    </div>
  );
};
