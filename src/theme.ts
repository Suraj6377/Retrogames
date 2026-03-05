export type Theme = {
  id: string;
  name: string;
  bg: string;
  accent: string;
  text: string;
};

export const themes: Theme[] = [
  {
    id: 'emerald',
    name: 'Emerald Vault',
    bg: 'bg-[#050505]',
    accent: 'emerald-500',
    text: 'text-white',
  },
  {
    id: 'cyber',
    name: 'Cyber Neon',
    bg: 'bg-[#0a0a0a]',
    accent: 'cyan-500',
    text: 'text-cyan-50',
  },
  {
    id: 'sunset',
    name: 'Sunset Retro',
    bg: 'bg-[#1a0a0a]',
    accent: 'orange-500',
    text: 'text-orange-50',
  },
];
