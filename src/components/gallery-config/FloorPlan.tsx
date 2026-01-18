import React from 'react';
import { Label } from '@/components/ui/label';
import WallButton from './WallButton';

type OuterFloor = 'ground' | 'first';
const OUTER_INDICES = [0, 1, 2, 3, 4] as const;

interface FloorPlanProps {
  outerFloor: OuterFloor;
  setOuterFloor: (floor: OuterFloor) => void;
  selectedPanelKey: string;
  setSelectedPanelKey: (key: string) => void;
  getLockStatus: (key: string) => { isLocked: boolean; isLockedByMe: boolean };
  getFriendlyLabel: (key: string) => string;
}

const FloorPlan: React.FC<FloorPlanProps> = ({ 
  outerFloor, 
  setOuterFloor, 
  selectedPanelKey, 
  setSelectedPanelKey, 
  getLockStatus,
  getFriendlyLabel
}) => {
  return (
    <div className="rounded-xl border bg-slate-950 p-4 space-y-4">
      <div className="flex justify-between items-center">
        <Label className="text-white text-xs font-bold uppercase tracking-wider">Interactive Floor Plan</Label>
        <div className="bg-white/10 p-0.5 rounded-full flex gap-1">
          {(['ground', 'first'] as OuterFloor[]).map(f => (
            <button 
              key={f} 
              type="button"
              onClick={() => setOuterFloor(f)} 
              className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all ${outerFloor === f ? 'bg-primary text-primary-foreground' : 'text-slate-400'}`}
            >
              {f === 'ground' ? 'GROUND' : 'FIRST'}
            </button>
          ))}
        </div>
      </div>

      <div className="relative w-full border border-white/5 rounded-lg bg-slate-900 flex justify-center overflow-hidden">
        <div className="w-full max-w-[480px] aspect-square relative p-12">
          {/* Main Floor Container */}
          <div className="relative w-full h-full border border-dashed border-white/10 rounded-lg">
            
            {/* Outer Walls: North at Top, South at Bottom */}
            {['north', 'south'].map(w => (
              <div key={w} className={`absolute ${w === 'north' ? '-top-10' : '-bottom-10'} left-0 right-0 flex h-10`}>
                {OUTER_INDICES.map(i => {
                  const key = `${w}-wall-${i}-${outerFloor}`;
                  const lock = getLockStatus(key);
                  return (
                    <WallButton 
                      key={key} 
                      panelKey={key} 
                      isSelected={selectedPanelKey === key}
                      isLocked={lock.isLocked}
                      isLockedByMe={lock.isLockedByMe}
                      label={getFriendlyLabel(key)}
                      onClick={setSelectedPanelKey}
                      className="flex-1" 
                    />
                  );
                })}
              </div>
            ))}

            {/* Outer Walls: West at Left, East at Right */}
            {['west', 'east'].map(w => (
              <div key={w} className={`absolute top-0 bottom-0 ${w === 'west' ? '-left-10' : '-right-10'} flex flex-col w-10`}>
                {OUTER_INDICES.map(i => {
                  const key = `${w}-wall-${i}-${outerFloor}`;
                  const lock = getLockStatus(key);
                  return (
                    <WallButton 
                      key={key} 
                      panelKey={key} 
                      isSelected={selectedPanelKey === key}
                      isLocked={lock.isLocked}
                      isLockedByMe={lock.isLockedByMe}
                      label={getFriendlyLabel(key)}
                      onClick={setSelectedPanelKey}
                      className="flex-1" 
                      orientation="vertical"
                    />
                  );
                })}
              </div>
            ))}
            
            {/* Inner Walls (Only show on ground floor) */}
            {outerFloor === 'ground' && (
              <div className="absolute inset-0">
                {/* 
                  Inner wall layout logic:
                  - 40% and 60% mark the +/- 5 unit walls relative to center (50%).
                  - 20-38% and 62-80% span the +/- 10 unit segments relative to center.
                  - Horizontal walls are North/South.
                  - Vertical walls are East/West.
                */}

                {/* North Inner Walls (Horizontal segments at top: 38%) */}
                <div className="absolute top-[38%] left-[20%] w-[18%] h-12 -translate-y-1/2 flex flex-col gap-1">
                  {['north-inner-wall-outer-0', 'north-inner-wall-inner-0'].map(key => {
                    const lock = getLockStatus(key);
                    return <WallButton key={key} panelKey={key} isSelected={selectedPanelKey === key} isLocked={lock.isLocked} isLockedByMe={lock.isLockedByMe} label={getFriendlyLabel(key)} onClick={setSelectedPanelKey} className="h-1/2" />;
                  })}
                </div>
                <div className="absolute top-[38%] left-[62%] w-[18%] h-12 -translate-y-1/2 flex flex-col gap-1">
                  {['north-inner-wall-outer-1', 'north-inner-wall-inner-1'].map(key => {
                    const lock = getLockStatus(key);
                    return <WallButton key={key} panelKey={key} isSelected={selectedPanelKey === key} isLocked={lock.isLocked} isLockedByMe={lock.isLockedByMe} label={getFriendlyLabel(key)} onClick={setSelectedPanelKey} className="h-1/2" />;
                  })}
                </div>

                {/* South Inner Walls (Horizontal segments at top: 62%) */}
                <div className="absolute top-[62%] left-[20%] w-[18%] h-12 -translate-y-1/2 flex flex-col gap-1">
                  {['south-inner-wall-inner-0', 'south-inner-wall-outer-0'].map(key => {
                    const lock = getLockStatus(key);
                    return <WallButton key={key} panelKey={key} isSelected={selectedPanelKey === key} isLocked={lock.isLocked} isLockedByMe={lock.isLockedByMe} label={getFriendlyLabel(key)} onClick={setSelectedPanelKey} className="h-1/2" />;
                  })}
                </div>
                <div className="absolute top-[62%] left-[62%] w-[18%] h-12 -translate-y-1/2 flex flex-col gap-1">
                  {['south-inner-wall-inner-1', 'south-inner-wall-outer-1'].map(key => {
                    const lock = getLockStatus(key);
                    return <WallButton key={key} panelKey={key} isSelected={selectedPanelKey === key} isLocked={lock.isLocked} isLockedByMe={lock.isLockedByMe} label={getFriendlyLabel(key)} onClick={setSelectedPanelKey} className="h-1/2" />;
                  })}
                </div>
                
                {/* West Inner Walls (Vertical segments at left: 38%) */}
                <div className="absolute left-[38%] top-[20%] h-[18%] w-12 -translate-x-1/2 flex gap-1">
                  {['west-inner-wall-outer-0', 'west-inner-wall-inner-0'].map(key => {
                    const lock = getLockStatus(key);
                    return <WallButton key={key} panelKey={key} isSelected={selectedPanelKey === key} isLocked={lock.isLocked} isLockedByMe={lock.isLockedByMe} label={getFriendlyLabel(key)} onClick={setSelectedPanelKey} className="w-1/2" orientation="vertical" />;
                  })}
                </div>
                <div className="absolute left-[38%] top-[62%] h-[18%] w-12 -translate-x-1/2 flex gap-1">
                  {['west-inner-wall-outer-1', 'west-inner-wall-inner-1'].map(key => {
                    const lock = getLockStatus(key);
                    return <WallButton key={key} panelKey={key} isSelected={selectedPanelKey === key} isLocked={lock.isLocked} isLockedByMe={lock.isLockedByMe} label={getFriendlyLabel(key)} onClick={setSelectedPanelKey} className="w-1/2" orientation="vertical" />;
                  })}
                </div>

                {/* East Inner Walls (Vertical segments at left: 62%) */}
                <div className="absolute left-[62%] top-[20%] h-[18%] w-12 -translate-x-1/2 flex gap-1">
                  {['east-inner-wall-inner-0', 'east-inner-wall-outer-0'].map(key => {
                    const lock = getLockStatus(key);
                    return <WallButton key={key} panelKey={key} isSelected={selectedPanelKey === key} isLocked={lock.isLocked} isLockedByMe={lock.isLockedByMe} label={getFriendlyLabel(key)} onClick={setSelectedPanelKey} className="w-1/2" orientation="vertical" />;
                  })}
                </div>
                <div className="absolute left-[62%] top-[62%] h-[18%] w-12 -translate-x-1/2 flex gap-1">
                  {['east-inner-wall-inner-1', 'east-inner-wall-outer-1'].map(key => {
                    const lock = getLockStatus(key);
                    return <WallButton key={key} panelKey={key} isSelected={selectedPanelKey === key} isLocked={lock.isLocked} isLockedByMe={lock.isLockedByMe} label={getFriendlyLabel(key)} onClick={setSelectedPanelKey} className="w-1/2" orientation="vertical" />;
                  })}
                </div>

                {/* Central Point */}
                <div className="absolute inset-[48%] border border-white/20 rounded-full flex items-center justify-center pointer-events-none">
                   <div className="w-1 h-1 bg-white/40 rounded-full" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="text-[10px] text-slate-400 flex justify-between items-center px-1">
        <span className="truncate">Selected: <span className="text-white font-bold">{selectedPanelKey ? getFriendlyLabel(selectedPanelKey) : 'Select a wall segment'}</span></span>
      </div>
    </div>
  );
};

export default FloorPlan;