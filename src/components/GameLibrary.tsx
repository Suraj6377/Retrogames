import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameROM, getAllROMs, saveROM, deleteROM } from '../db';
import { Upload, Play, Trash2, Plus, Gamepad2, Clock, Search, Settings, FileUp, CheckCircle2, XCircle, Loader2, X, Archive, Palette } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import JSZip from 'jszip';
import { Theme, themes } from '../theme';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface UploadingFile {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  progress: number;
  message?: string;
}

interface GameLibraryProps {
  onPlay: (rom: GameROM) => void;
  onOpenSettings: () => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}

export const GameLibrary: React.FC<GameLibraryProps> = ({ onPlay, onOpenSettings, theme, onThemeChange }) => {
  const [games, setGames] = useState<GameROM[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [focusedGameIndex, setFocusedGameIndex] = useState<number | null>(null);
  const gameRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'addedAt'>('addedAt');
  const [isDragging, setIsDragging] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [gameToDelete, setGameToDelete] = useState<GameROM | null>(null);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const dragCounter = useRef(0);

  const filteredGames = React.useMemo(() => {
    return games
      .filter(game => game.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        return b.addedAt - a.addedAt;
      });
  }, [games, searchQuery, sortBy]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (filteredGames.length === 0) return;

      // Determine columns based on grid layout (simplified)
      const isMobile = window.innerWidth < 640;
      const isTablet = window.innerWidth < 1024;
      const columns = isMobile ? 1 : isTablet ? 2 : 4;

      switch (e.key) {
        case 'ArrowRight':
          setFocusedGameIndex(prev => (prev === null ? 0 : Math.min(prev + 1, filteredGames.length - 1)));
          break;
        case 'ArrowLeft':
          setFocusedGameIndex(prev => (prev === null ? 0 : Math.max(prev - 1, 0)));
          break;
        case 'ArrowDown':
          setFocusedGameIndex(prev => (prev === null ? 0 : Math.min(prev + columns, filteredGames.length - 1)));
          break;
        case 'ArrowUp':
          setFocusedGameIndex(prev => (prev === null ? 0 : Math.max(prev - columns, 0)));
          break;
        case 'Enter':
          if (focusedGameIndex !== null) {
            onPlay(filteredGames[focusedGameIndex]);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredGames, focusedGameIndex, onPlay]);

  useEffect(() => {
    if (focusedGameIndex !== null && gameRefs.current[focusedGameIndex]) {
      gameRefs.current[focusedGameIndex]?.focus();
    }
  }, [focusedGameIndex]);

  const loadGames = useCallback(async () => {
    const allGames = await getAllROMs();
    setGames(allGames);
  }, []);

  useEffect(() => {
    loadGames();
  }, [loadGames]);

  const processFiles = async (files: FileList | File[]) => {
    setIsUploading(true);
    const filesArray = Array.from(files);
    
    // Initialize uploading state
    const initialUploadingState: UploadingFile[] = filesArray.map(file => ({
      id: crypto.randomUUID(),
      name: file.name,
      status: 'pending',
      progress: 0,
    }));
    
    setUploadingFiles(prev => [...initialUploadingState, ...prev]);

    for (let i = 0; i < filesArray.length; i++) {
      const file = filesArray[i];
      const uploadId = initialUploadingState[i].id;
      
      const updateFileStatus = (status: UploadingFile['status'], progress: number, message?: string) => {
        setUploadingFiles(prev => prev.map(f => 
          f.id === uploadId ? { ...f, status, progress, message } : f
        ));
      };

      updateFileStatus('processing', 10);

      const name = file.name.toLowerCase();
      const isNes = name.endsWith('.nes');
      const isZip = name.endsWith('.zip');
      
      if (!isNes && !isZip) {
        updateFileStatus('error', 100, 'Invalid file type. Only .nes and .zip are supported.');
        continue;
      }

      try {
        if (isZip) {
          updateFileStatus('processing', 20, 'Extracting archive...');
          const zip = new JSZip();
          const zipContent = await zip.loadAsync(file);
          
          // Find the first .nes file in the zip
          const romFile = Object.values(zipContent.files).find(f => 
            !f.dir && f.name.toLowerCase().endsWith('.nes')
          );

          if (!romFile) {
            throw new Error('No valid .nes file found inside the zip archive.');
          }

          const data = await romFile.async('uint8array');
          const romName = romFile.name.split('/').pop() || romFile.name;
          
          // Validate NES Header
          if (data.length < 4 || data[0] !== 0x4E || data[1] !== 0x45 || data[2] !== 0x53 || data[3] !== 0x1A) {
            throw new Error('Invalid NES ROM header inside zip. This file is not a valid NES ROM.');
          }

          const newGame: GameROM = {
            id: crypto.randomUUID(),
            name: romName.replace(/\.nes$/i, ''),
            data,
            addedAt: Date.now(),
            type: 'nes',
          };
          await saveROM(newGame);
          await loadGames(); // Refresh immediately after saving
          updateFileStatus('success', 100, `Extracted and installed: ${romName}`);
          continue;
        }

        const reader = new FileReader();
        const promise = new Promise<void>((resolve, reject) => {
          reader.onprogress = (event) => {
            if (event.lengthComputable) {
              const progress = Math.round((event.loaded / event.total) * 50) + 10;
              updateFileStatus('processing', progress);
            }
          };

          reader.onload = async (event) => {
            try {
              updateFileStatus('processing', 70);
              const data = new Uint8Array(event.target?.result as ArrayBuffer);
              
              // Validate NES Header if it's a .nes file
              if (isNes) {
                if (data.length < 4 || data[0] !== 0x4E || data[1] !== 0x45 || data[2] !== 0x53 || data[3] !== 0x1A) {
                  throw new Error('Invalid NES ROM header. This file is not a valid NES ROM.');
                }
              }

              const newGame: GameROM = {
                id: crypto.randomUUID(),
                name: file.name.replace(/\.nes$/i, ''),
                data,
                addedAt: Date.now(),
                type: 'nes',
              };
              await saveROM(newGame);
              await loadGames(); // Refresh immediately after saving
              updateFileStatus('success', 100, 'Installed successfully');
              resolve();
            } catch (err) {
              reject(err);
            }
          };
          reader.onerror = () => reject(new Error('Failed to read file'));
        });
        reader.readAsArrayBuffer(file);
        await promise;
      } catch (error) {
        updateFileStatus('error', 100, error instanceof Error ? error.message : 'Unknown error');
      }
    }

    await loadGames();
    setIsUploading(false);
    
    // Clear successful uploads after a delay
    setTimeout(() => {
      setUploadingFiles(prev => prev.filter(f => f.status === 'error'));
    }, 5000);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(e.target.files);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!gameToDelete) return;
    
    try {
      await deleteROM(gameToDelete.id);
      await loadGames();
      setGameToDelete(null);
    } catch (error) {
      console.error('Failed to delete game:', error);
    }
  };

  const openDeleteConfirm = (game: GameROM, e: React.MouseEvent) => {
    e.stopPropagation();
    setGameToDelete(game);
  };

  return (
    <div 
      className="max-w-7xl mx-auto px-6 py-12 min-h-screen"
      onDragEnter={handleDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Upload Progress Panel */}
      <AnimatePresence>
        {uploadingFiles.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            className="fixed top-6 right-6 z-[80] w-80 max-h-[80vh] overflow-y-auto bg-[#1a1a1a] border border-white/10 rounded-3xl shadow-2xl p-6 backdrop-blur-xl"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xs font-mono uppercase tracking-[0.2em] text-white/40">Installation Queue</h3>
              <button 
                onClick={() => setUploadingFiles([])}
                className="p-2 hover:bg-white/5 rounded-xl text-white/20 hover:text-white transition-all"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="space-y-4">
              {uploadingFiles.map(file => (
                <motion.div 
                  key={file.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white/5 border border-white/5 rounded-2xl p-4"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{file.name}</p>
                      <p className={cn(
                        "text-[10px] uppercase tracking-widest mt-1",
                        file.status === 'success' ? "text-emerald-400" : 
                        file.status === 'error' ? "text-red-400" : "text-white/40"
                      )}>
                        {file.status === 'processing' ? 'Processing...' : 
                         file.status === 'pending' ? 'Waiting...' : 
                         file.status === 'success' ? 'Success' : 'Failed'}
                      </p>
                    </div>
                    {file.status === 'processing' && <Loader2 size={16} className="text-emerald-500 animate-spin shrink-0" />}
                    {file.status === 'success' && <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />}
                    {file.status === 'error' && <XCircle size={16} className="text-red-500 shrink-0" />}
                  </div>
                  
                  <div className="relative h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${file.progress}%` }}
                      className={cn(
                        "absolute inset-y-0 left-0 transition-all duration-300",
                        file.status === 'error' ? "bg-red-500" : "bg-emerald-500"
                      )}
                    />
                  </div>
                  
                  {file.message && (
                    <p className={cn(
                      "text-[10px] mt-2 leading-relaxed",
                      file.status === 'error' ? "text-red-400/80" : "text-white/40"
                    )}>
                      {file.message}
                    </p>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drag Overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-emerald-500/90 backdrop-blur-md flex flex-col items-center justify-center text-black p-12 text-center"
          >
            <motion.div
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="border-4 border-dashed border-black/20 rounded-[60px] p-20 flex flex-col items-center"
            >
              <FileUp size={80} strokeWidth={1.5} className="mb-8 animate-bounce" />
              <h2 className="text-5xl font-black tracking-tighter mb-4 uppercase">Drop to Install</h2>
              <p className="text-black/60 font-mono text-sm tracking-widest uppercase">Release your .nes or .zip files to add them to the vault</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {showToast && (
          <motion.div 
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[70] bg-emerald-500 text-black px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 font-bold"
          >
            <CheckCircle2 size={20} />
            <span className="text-sm uppercase tracking-widest">Games Installed Successfully</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16">
        <div className="space-y-4">
          <motion.div 
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="flex items-center gap-3 text-emerald-500"
          >
            <Gamepad2 size={24} />
            <span className="text-xs font-mono uppercase tracking-[0.3em] font-bold">System Online</span>
          </motion.div>
          <motion.h1 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-6xl md:text-8xl font-black tracking-tighter text-white leading-[0.9]"
          >
            RETRO<br />VAULT
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            transition={{ delay: 0.2 }}
            className="text-white max-w-md text-lg font-light leading-relaxed"
          >
            Your personal archive of classic 8-bit experiences. Drag and drop .nes or .zip files anywhere to begin.
          </motion.p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex gap-2">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-emerald-500 transition-colors" size={18} />
              <input 
                type="text"
                placeholder="SEARCH ARCHIVE..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-2xl pl-12 pr-6 py-4 text-white font-mono text-xs tracking-widest focus:outline-none focus:border-emerald-500/50 focus:bg-white/10 transition-all w-full sm:w-64"
              />
            </div>
            <select 
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'name' | 'addedAt')}
              className="bg-white/5 border border-white/10 rounded-2xl px-4 py-4 text-white font-mono text-xs tracking-widest focus:outline-none focus:border-emerald-500/50 focus:bg-white/10 transition-all"
            >
              <option value="addedAt">Newest</option>
              <option value="name">Name</option>
            </select>
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={() => setShowThemeMenu(!showThemeMenu)}
              className="p-4 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white border border-white/10 rounded-2xl transition-all active:scale-95"
              title="Change Theme"
            >
              <Palette size={20} />
            </button>
            <AnimatePresence>
              {showThemeMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute right-0 mt-16 bg-[#1a1a1a] border border-white/10 rounded-2xl p-2 z-[90] shadow-2xl"
                >
                  {themes.map(t => (
                    <button
                      key={t.id}
                      onClick={() => { onThemeChange(t); setShowThemeMenu(false); }}
                      className={cn(
                        "block w-full text-left px-4 py-2 rounded-xl text-xs font-mono uppercase tracking-widest transition-colors",
                        theme.id === t.id ? "bg-white/10 text-white" : "text-white/40 hover:text-white hover:bg-white/5"
                      )}
                    >
                      {t.name}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            <button 
              onClick={onOpenSettings}
              className="p-4 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white border border-white/10 rounded-2xl transition-all active:scale-95"
              title="Controls Settings"
            >
              <Settings size={20} />
            </button>
            <label className="cursor-pointer group flex-1 sm:flex-none">
              <input 
                type="file" 
                accept=".nes,.zip" 
                multiple 
                onChange={handleFileUpload} 
                className="hidden" 
              />
              <div className={cn(
                "px-8 py-4 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all active:scale-95 shadow-[0_0_20px_rgba(0,0,0,0.2)]",
                `bg-${theme.accent} text-black`
              )}>
                <Plus size={20} />
                <span className="text-sm uppercase tracking-widest">Install</span>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* Games Grid */}
      <AnimatePresence mode="popLayout">
        {filteredGames.length > 0 ? (
          <motion.div 
            layout
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
          >
            {filteredGames.map((game, index) => (
              <motion.div
                key={game.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => onPlay(game)}
                className="group relative bg-white/5 border border-white/10 rounded-3xl p-6 cursor-pointer hover:bg-white/10 hover:border-emerald-500/30 transition-all duration-500 overflow-hidden"
              >
                {/* Background Pattern */}
                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                  <Gamepad2 size={120} />
                </div>

                <div className="relative z-10 flex flex-col h-full">
                  <div className="flex justify-between items-start mb-8">
                    <div className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500",
                      game.type === 'nes' ? "bg-emerald-500/10 text-emerald-500 group-hover:bg-emerald-500 group-hover:text-black" : "bg-purple-500/10 text-purple-500 group-hover:bg-purple-500 group-hover:text-black"
                    )}>
                      <Play size={20} fill="currentColor" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-[8px] font-mono px-2 py-1 rounded-md uppercase tracking-widest",
                        game.type === 'nes' ? "bg-emerald-500/20 text-emerald-400" : "bg-purple-500/20 text-purple-400"
                      )}>
                        {game.type}
                      </span>
                      <button 
                        onClick={(e) => openDeleteConfirm(game, e)}
                        className="p-2 text-white/20 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>

                  {game.thumbnail ? (
                    <div className="mb-4 rounded-xl overflow-hidden aspect-video bg-black/40 border border-white/5">
                      <img src={game.thumbnail} alt={game.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </div>
                  ) : (
                    <div className="mb-4 rounded-xl aspect-video bg-black/40 border border-white/5 flex items-center justify-center text-white/5 group-hover:text-white/10 transition-colors">
                      <Gamepad2 size={48} />
                    </div>
                  )}

                  <h3 className="text-xl font-bold text-white mb-2 line-clamp-2 group-hover:text-emerald-400 transition-colors">
                    {game.name}
                  </h3>
                  
                  <div className="space-y-1 mb-4">
                    {game.developer && <p className="text-white/50 text-xs font-medium">{game.developer}</p>}
                    {game.releaseDate && <p className="text-white/30 text-[10px] font-mono uppercase">{game.releaseDate}</p>}
                  </div>

                  <div className="mt-auto flex items-center gap-2 text-white/30 text-[10px] font-mono uppercase tracking-widest">
                    <Clock size={12} />
                    <span>Added {new Date(game.addedAt).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Hover Glow */}
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/0 via-emerald-500/0 to-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-32 border-2 border-dashed border-white/5 rounded-[40px]"
          >
            <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center text-white/20 mb-6">
              <Upload size={32} />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">No Games Found</h2>
            <p className="text-white/40 font-light">Drag and drop .nes files here or use the install button.</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {gameToDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setGameToDelete(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-[#1a1a1a] border border-white/10 rounded-[40px] p-10 max-w-md w-full shadow-2xl overflow-hidden"
            >
              {/* Background Glow */}
              <div className="absolute -top-24 -right-24 w-48 h-48 bg-red-500/10 blur-[80px] rounded-full" />
              
              <div className="relative z-10 flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-3xl bg-red-500/10 flex items-center justify-center text-red-500 mb-8">
                  <Trash2 size={40} />
                </div>
                
                <h2 className="text-3xl font-black tracking-tighter text-white mb-4 uppercase">Delete Archive?</h2>
                <p className="text-white/40 font-light mb-10 leading-relaxed">
                  Are you sure you want to permanently remove <span className="text-white font-bold">{gameToDelete.name}</span> from your vault? This action cannot be undone.
                </p>
                
                <div className="flex flex-col sm:flex-row gap-4 w-full">
                  <button 
                    onClick={() => setGameToDelete(null)}
                    className="flex-1 px-8 py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-2xl transition-all active:scale-95 uppercase tracking-widest text-xs"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleDelete}
                    className="flex-1 px-8 py-4 bg-red-600 hover:bg-red-500 text-white font-bold rounded-2xl transition-all active:scale-95 shadow-lg shadow-red-600/20 uppercase tracking-widest text-xs"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer Info */}
      <div className="mt-24 pt-12 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-8 text-white/20 font-mono text-[10px] uppercase tracking-[0.2em]">
        <div className="flex items-center gap-6">
          <span>8-Bit Architecture</span>
          <span className="w-1 h-1 bg-white/20 rounded-full" />
          <span>Local Storage Enabled</span>
        </div>
        <div className="flex items-center gap-6">
          <span>v1.0.0 Stable</span>
          <span className="w-1 h-1 bg-white/20 rounded-full" />
          <span>Built for Enthusiasts</span>
        </div>
      </div>
    </div>
  );
};
