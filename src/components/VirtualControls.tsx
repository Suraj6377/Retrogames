import React from 'react';
import { motion } from 'motion/react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

interface VirtualControlsProps {
  onButtonDown: (button: string) => void;
  onButtonUp: (button: string) => void;
  onInteraction?: () => void;
  isDimmed?: boolean;
}

export const VirtualControls: React.FC<VirtualControlsProps> = ({ 
  onButtonDown, 
  onButtonUp,
  onInteraction,
  isDimmed = false
}) => {
  const Button = ({ 
    label, 
    id, 
    className = "", 
    children,
    isDPad = false
  }: { 
    label?: string; 
    id: string; 
    className?: string; 
    children?: React.ReactNode;
    isDPad?: boolean;
  }) => {
    const handlePress = () => {
      if ('vibrate' in navigator) {
        // Use a slightly stronger vibration for A/B, shorter for D-Pad
        navigator.vibrate(id === 'A' || id === 'B' ? 15 : 10);
      }
      onButtonDown(id);
    };

    const handleRelease = () => {
      onButtonUp(id);
    };

    return (
      <motion.button
        whileTap={{ scale: 0.9, backgroundColor: "rgba(255, 255, 255, 0.25)", boxShadow: "0 0 15px rgba(255, 255, 255, 0.3)" }}
        className={`select-none touch-none flex items-center justify-center rounded-2xl bg-white/5 border border-white/10 shadow-lg backdrop-blur-md transition-all active:brightness-125 ${className}`}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!isDPad) {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          }
          onInteraction?.();
          handlePress();
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          handleRelease();
        }}
        onPointerCancel={(e) => {
          e.preventDefault();
          handleRelease();
        }}
        // Support for sliding on D-Pad
        onPointerEnter={(e) => {
          if (isDPad && e.buttons === 1) {
            handlePress();
          }
        }}
        onPointerLeave={(e) => {
          if (isDPad && e.buttons === 1) {
            handleRelease();
          }
        }}
      >
        {children || <span className="text-white font-bold text-xs tracking-tighter">{label}</span>}
      </motion.button>
    );
  };

  return (
    <div className={`w-full px-4 pb-8 sm:px-10 sm:pb-12 flex justify-between items-end pointer-events-none z-[60] safe-area-bottom touch-none transition-opacity duration-700 ${isDimmed ? 'opacity-30' : 'opacity-100'}`}>
      {/* D-Pad - Modern Cross Style */}
      <div className="relative w-32 h-32 sm:w-40 sm:h-40 pointer-events-auto touch-none">
        <div className="absolute inset-0 bg-white/5 rounded-3xl rotate-45 scale-75 blur-2xl" />
        <Button id="UP" isDPad className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-12 sm:w-14 sm:h-14 rounded-xl">
          <ChevronUp className="text-white" size={24} />
        </Button>
        <Button id="DOWN" isDPad className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-12 sm:w-14 sm:h-14 rounded-xl">
          <ChevronDown className="text-white" size={24} />
        </Button>
        <Button id="LEFT" isDPad className="absolute left-0 top-1/2 -translate-y-1/2 w-12 h-12 sm:w-14 sm:h-14 rounded-xl">
          <ChevronLeft className="text-white" size={24} />
        </Button>
        <Button id="RIGHT" isDPad className="absolute right-0 top-1/2 -translate-y-1/2 w-12 h-12 sm:w-14 sm:h-14 rounded-xl">
          <ChevronRight className="text-white" size={24} />
        </Button>
        {/* Center Pad */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 sm:w-14 sm:h-14 bg-white/5 rounded-xl pointer-events-none border border-white/5" />
      </div>

      {/* Start / Select - Pill Style */}
      <div className="flex flex-col gap-2 sm:gap-3 mb-4 sm:mb-6 pointer-events-auto">
        <Button id="SELECT" className="w-20 h-7 sm:w-24 sm:h-8 rounded-full" label="SELECT" />
        <Button id="START" className="w-20 h-7 sm:w-24 sm:h-8 rounded-full" label="START" />
      </div>

      {/* A / B Buttons - Modern Stacked Style */}
      <div className="relative w-36 h-36 sm:w-44 sm:h-44 pointer-events-auto">
        <div className="absolute inset-0 bg-red-500/5 rounded-full blur-3xl" />
        <Button id="B" className="absolute bottom-2 left-0 w-16 h-16 sm:w-18 sm:h-18 rounded-full bg-red-500/10 border-red-500/20 text-red-500" label="B" />
        <Button id="A" className="absolute top-0 right-2 w-16 h-16 sm:w-18 sm:h-18 rounded-full bg-red-500/20 border-red-500/40 text-red-500" label="A" />
      </div>
    </div>
  );
};
