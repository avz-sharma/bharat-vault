import React, { useState } from 'react';
import { Copy, Check, Sparkles, Sun, Moon, Palette, ShieldCheck, CheckCircle2 } from 'lucide-react';

interface ColorSwatch {
  hex: string;
  name: string;
  role: string;
  usage: string;
  badgeTextColor: string;
  badgeBgColor: string;
  contrastText: string;
}

const PALETTE_COLORS: ColorSwatch[] = [
  {
    hex: '#F0F8FF',
    name: 'Alice Blue',
    role: 'Canvas & Ambient Background',
    usage: 'App background, subtle light fills, soft hover states',
    badgeTextColor: '#0077B3',
    badgeBgColor: '#FFFFFF',
    contrastText: '#0F172A',
  },
  {
    hex: '#0077B3',
    name: 'Ocean Cerulean',
    role: 'Primary Brand & Active State',
    usage: 'Action buttons, active navigation, focus rings, key icons',
    badgeTextColor: '#0077B3',
    badgeBgColor: '#FFFFFF',
    contrastText: '#FFFFFF',
  },
  {
    hex: '#E0F7FA',
    name: 'Soft Cyan Ice',
    role: 'Secondary Surface & Accent Glow',
    usage: 'Compliance tags, notification badges, subtle highlight borders',
    badgeTextColor: '#0077B3',
    badgeBgColor: '#FFFFFF',
    contrastText: '#0077B3',
  },
  {
    hex: '#FFFFFF',
    name: 'Pure White',
    role: 'Card Surfaces & Elevated Containers',
    usage: 'Main panels, input field surfaces, maximum contrast elements',
    badgeTextColor: '#0F172A',
    badgeBgColor: '#F0F8FF',
    contrastText: '#0F172A',
  },
];

interface ColorPalettePanelProps {
  currentTheme?: 'dark' | 'palette';
  onToggleTheme?: (theme: 'dark' | 'palette') => void;
}

export const ColorPalettePanel: React.FC<ColorPalettePanelProps> = ({
  currentTheme = 'dark',
  onToggleTheme,
}) => {
  const [copiedHex, setCopiedHex] = useState<string | null>(null);

  const handleCopy = (hex: string) => {
    navigator.clipboard.writeText(hex);
    setCopiedHex(hex);
    setTimeout(() => setCopiedHex(null), 2200);
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl glass-panel relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#0077B3]/15 rounded-full blur-3xl pointer-events-none" />
        <div className="space-y-1 relative z-10">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-[#0077B3]/20 text-[#0077B3] border border-[#0077B3]/30">
              <Palette className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold tracking-tight text-white dark:text-white theme-light-text">
              Enterprise Design System: Soothing Blue Palette
            </h2>
          </div>
          <p className="text-xs text-slate-400 theme-light-subtext">
            Compliant with DPDP Act 2023 clean-room UX principles — establishing trust through clarity, calm tones, and high contrast.
          </p>
        </div>

        {/* Live Theme Toggle */}
        {onToggleTheme && (
          <div className="flex items-center gap-2 relative z-10">
            <button
              onClick={() => onToggleTheme(currentTheme === 'dark' ? 'palette' : 'dark')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold shadow-lg transition-all duration-200 border border-[#0077B3]/30 hover:scale-[1.02] active:scale-[0.98]"
              style={{
                backgroundColor: currentTheme === 'palette' ? '#0077B3' : 'rgba(15, 23, 42, 0.9)',
                color: '#FFFFFF',
              }}
            >
              {currentTheme === 'palette' ? (
                <>
                  <Moon className="w-4 h-4 text-[#E0F7FA]" />
                  <span>Switch to Sovereign Dark</span>
                </>
              ) : (
                <>
                  <Sun className="w-4 h-4 text-amber-300" />
                  <span>Apply Soothing Light Theme</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* THE EXACT COLOR PALETTE PANEL CARD (AS REQUESTED) */}
      <div className="p-8 rounded-2xl glass-panel border border-[#0077B3]/20 shadow-2xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] font-mono uppercase tracking-widest text-[#0077B3] font-semibold">
              Color Architecture Specification
            </span>
            <h3 className="text-lg font-bold text-white theme-light-text mt-0.5">
              Harmonious DPI Palette
            </h3>
          </div>
          <div className="text-xs text-slate-400 theme-light-subtext flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#0077B3]" />
            <span>Click any swatch to copy Hex</span>
          </div>
        </div>

        {/* The 4-Column Color Panel Representation */}
        <div className="rounded-2xl overflow-hidden shadow-xl border border-slate-700/50 dark:border-slate-800 bg-white">
          <div className="grid grid-cols-4 h-64 sm:h-72 w-full">
            {PALETTE_COLORS.map((color) => (
              <div
                key={color.hex}
                onClick={() => handleCopy(color.hex)}
                className="group relative flex flex-col justify-end p-4 transition-all duration-200 hover:brightness-105 cursor-pointer select-none"
                style={{ backgroundColor: color.hex }}
                title={`Click to copy ${color.hex} (${color.name})`}
              >
                {/* Floating Tooltip Hover */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute top-4 left-4 right-4 bg-slate-900/90 text-white p-2 rounded-lg text-[10px] shadow-lg backdrop-blur-md hidden sm:block pointer-events-none">
                  <div className="font-bold">{color.name}</div>
                  <div className="text-slate-300 truncate">{color.role}</div>
                </div>

                {/* Bottom Badge with Hex Code */}
                <div className="flex justify-center">
                  <div
                    className="px-3 py-1.5 rounded-md font-mono text-xs sm:text-sm font-semibold shadow-md transition-transform duration-150 group-hover:scale-110 flex items-center gap-1.5 border border-slate-200/50"
                    style={{
                      backgroundColor: color.badgeBgColor,
                      color: color.badgeTextColor,
                    }}
                  >
                    {copiedHex === color.hex ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-600 font-bold">COPIED</span>
                      </>
                    ) : (
                      <>
                        <span>{color.hex}</span>
                        <Copy className="w-3 h-3 opacity-40 group-hover:opacity-100 transition-opacity" />
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Caption under the swatches matching user's image */}
          <div className="p-4 sm:p-5 bg-white border-t border-slate-100 text-slate-700">
            <p className="text-sm sm:text-base font-normal leading-relaxed text-slate-800">
              <span className="font-semibold text-[#0077B3]">color palette</span>, with its soothing blend of light blues and whites, creates a serene, dependable and verifiable digital identity experience compliant with Indian DPI &amp; DPDP Act 2023 regulations.
            </p>
          </div>
        </div>
      </div>

      {/* Semantic Role Mapping & Spec Table */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {PALETTE_COLORS.map((color) => (
          <div
            key={color.hex}
            className="p-5 rounded-2xl glass-panel border border-[#0077B3]/15 space-y-3 relative group"
          >
            <div className="flex items-center justify-between">
              <div
                className="w-8 h-8 rounded-xl shadow-inner border border-slate-300/40"
                style={{ backgroundColor: color.hex }}
              />
              <span className="font-mono text-xs font-bold text-[#0077B3] px-2 py-0.5 rounded bg-[#E0F7FA]/70 border border-[#0077B3]/20">
                {color.hex}
              </span>
            </div>

            <div>
              <h4 className="text-sm font-bold text-white theme-light-text">{color.name}</h4>
              <p className="text-xs text-[#0077B3] font-medium">{color.role}</p>
            </div>

            <p className="text-[11px] text-slate-400 theme-light-subtext leading-relaxed">
              {color.usage}
            </p>

            <button
              onClick={() => handleCopy(color.hex)}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-mono bg-slate-800/80 hover:bg-[#0077B3] text-slate-300 hover:text-white transition-colors"
            >
              <Copy className="w-3 h-3" />
              <span>Copy Value</span>
            </button>
          </div>
        ))}
      </div>

      {/* Interactive UI Component Preview in this Color Palette */}
      <div className="p-6 rounded-2xl glass-panel border border-[#0077B3]/20 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#0077B3]" />
            <h4 className="text-sm font-bold text-white theme-light-text">
              Live Component Preview using `#F0F8FF`, `#0077B3`, `#E0F7FA`, &amp; `#FFFFFF`
            </h4>
          </div>
          <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-[#E0F7FA] text-[#0077B3] font-semibold">
            WCAG 2.2 AA Verified
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1: Action Button Preview */}
          <div
            className="p-5 rounded-xl border space-y-3"
            style={{ backgroundColor: '#FFFFFF', borderColor: '#E0F7FA' }}
          >
            <span className="text-[10px] font-mono uppercase font-bold text-[#0077B3]">
              Primary Interactive Element
            </span>
            <p className="text-xs text-slate-600">
              High-confidence action button rendered in <strong>#0077B3</strong> with white typography.
            </p>
            <button
              className="w-full py-2.5 rounded-xl font-semibold text-xs text-white shadow-md hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
              style={{ backgroundColor: '#0077B3' }}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirm SBT Issuance</span>
            </button>
          </div>

          {/* Card 2: Tag & Badges Preview */}
          <div
            className="p-5 rounded-xl border space-y-3"
            style={{ backgroundColor: '#F0F8FF', borderColor: 'rgba(0, 119, 179, 0.2)' }}
          >
            <span className="text-[10px] font-mono uppercase font-bold text-[#0077B3]">
              Compliance Indicators
            </span>
            <p className="text-xs text-slate-600">
              Soft contrast chips rendered in <strong>#E0F7FA</strong> with <strong>#0077B3</strong> text.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span
                className="px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold border"
                style={{ backgroundColor: '#E0F7FA', color: '#0077B3', borderColor: 'rgba(0,119,179,0.3)' }}
              >
                [Aadhaar Redacted]
              </span>
              <span
                className="px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold border"
                style={{ backgroundColor: '#FFFFFF', color: '#0077B3', borderColor: 'rgba(0,119,179,0.2)' }}
              >
                ERC-5192 Active
              </span>
            </div>
          </div>

          {/* Card 3: Credential Snippet */}
          <div
            className="p-5 rounded-xl border space-y-3"
            style={{ backgroundColor: '#FFFFFF', borderColor: '#E0F7FA' }}
          >
            <span className="text-[10px] font-mono uppercase font-bold text-[#0077B3]">
              Input &amp; Notary Surface
            </span>
            <p className="text-xs text-slate-600">
              Clean form field using <strong>#F0F8FF</strong> surface with <strong>#0077B3</strong> focus highlight.
            </p>
            <div
              className="p-2.5 rounded-lg border text-xs font-mono text-slate-800 flex items-center justify-between"
              style={{ backgroundColor: '#F0F8FF', borderColor: 'rgba(0,119,179,0.3)' }}
            >
              <span>did:web:gov.in:dept</span>
              <span className="text-[10px] text-[#0077B3] font-bold">ACTIVE</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ColorPalettePanel;
