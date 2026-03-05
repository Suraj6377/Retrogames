export interface GameROM {
  id: string;
  name: string;
  data: Uint8Array;
  addedAt: number;
  type: 'nes';
  thumbnail?: string; // base64 thumbnail
  releaseDate?: string;
  developer?: string;
}

export enum GameState {
  IDLE = 'IDLE',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED'
}

export interface ControlMapping {
  UP: string;
  DOWN: string;
  LEFT: string;
  RIGHT: string;
  A: string;
  B: string;
  START: string;
  SELECT: string;
}

export interface GamepadMapping {
  UP: number | null;
  DOWN: number | null;
  LEFT: number | null;
  RIGHT: number | null;
  A: number | null;
  B: number | null;
  START: number | null;
  SELECT: number | null;
}

export const DEFAULT_CONTROLS: ControlMapping = {
  UP: 'ArrowUp',
  DOWN: 'ArrowDown',
  LEFT: 'ArrowLeft',
  RIGHT: 'ArrowRight',
  A: 'x',
  B: 'z',
  START: 'Enter',
  SELECT: 'Shift',
};

export const DEFAULT_GAMEPAD_CONTROLS: GamepadMapping = {
  UP: 12,    // D-pad Up
  DOWN: 13,  // D-pad Down
  LEFT: 14,  // D-pad Left
  RIGHT: 15, // D-pad Right
  A: 0,      // A
  B: 1,      // B
  START: 9,  // Start
  SELECT: 8, // Select
};

export const NUMERIC_CONTROLS: ControlMapping = {
  UP: '2',
  DOWN: '8',
  LEFT: '4',
  RIGHT: '6',
  A: '5',
  B: '0',
  START: '3',
  SELECT: '1',
};
