/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { GameLibrary } from './components/GameLibrary';
import { NESEmulator } from './components/NESEmulator';
import { ControlsSettings } from './components/ControlsSettings';
import { GameROM } from './types';
import { AnimatePresence } from 'motion/react';
import { themes, Theme } from './theme';

export default function App() {
  const [activeGame, setActiveGame] = useState<GameROM | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(themes[0]);

  return (
    <div className={`min-h-screen ${theme.bg} ${theme.text} selection:bg-${theme.accent} selection:text-black transition-colors duration-500`}>
      {/* Background Noise/Texture */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
      
      <main className="relative z-10">
        <GameLibrary 
          onPlay={(rom) => setActiveGame(rom)} 
          onOpenSettings={() => setIsSettingsOpen(true)}
          theme={theme}
          onThemeChange={setTheme}
        />
      </main>

      <ControlsSettings 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />

      <AnimatePresence>
        {activeGame && (
          <NESEmulator 
            rom={activeGame} 
            onClose={() => setActiveGame(null)} 
            theme={theme}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
