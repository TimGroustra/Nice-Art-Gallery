import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2, Map as MapIcon, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface GalleryConfigRow {
  panel_key: string;
  collection_name: string | null;
  contract_address: string | null;
  default_token_id: number | null;
  show_collection: boolean | null;
}

interface SettingsPanelProps {
  selectedPanelKey: string;
  friendlyLabel: string;
  currentConfig: Partial<GalleryConfigRow>;
  setCurrentConfig: React.Dispatch<React.SetStateAction<Partial<GalleryConfigRow>>>;
  lockDurationDays: number;
  setLockDurationDays: (days: number) => void;
  handleSave: () => Promise<void>;
  isLoading: boolean;
  selectedLock: { isLocked: boolean; isLockedByMe: boolean; lockedUntil: Date | null };
  onOpenMap?: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  selectedPanelKey,
  friendlyLabel,
  currentConfig,
  setCurrentConfig,
  lockDurationDays,
  setLockDurationDays,
  handleSave,
  isLoading,
  selectedLock,
  onOpenMap
}) => {
  if (!selectedPanelKey) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center space-y-3 opacity-60 border-2 border-dashed rounded-xl">
        <MapIcon className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm">Please select a wall panel on the floor plan first.</p>
        {onOpenMap && (
          <Button variant="outline" size="sm" onClick={onOpenMap}>Open Floor Plan</Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="space-y-6 animate-in fade-in slide-in-from-top-1 duration-300">
        <div className="flex items-center justify-between p-3 border rounded-lg bg-secondary/10">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-tight">Active Selection</span>
            <span className="text-sm font-bold">{friendlyLabel}</span>
          </div>
          {onOpenMap && (
            <Button variant="ghost" size="sm" onClick={onOpenMap}>Change Selection</Button>
          )}
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Contract Address</Label>
            <Input 
              className="h-9 text-sm font-mono" 
              value={currentConfig.contract_address || ''} 
              onChange={e => setCurrentConfig(p => ({...p, contract_address: e.target.value}))} 
              placeholder="0x..." 
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Default Token ID</Label>
              <Input 
                className="h-9 text-sm" 
                type="number" 
                value={currentConfig.default_token_id || 1} 
                onChange={e => setCurrentConfig(p => ({...p, default_token_id: parseInt(e.target.value) || 1}))} 
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label className="text-xs">Lock for (Days)</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent><p className="text-xs">Locking consumes 1 available ElectroGem. Set to 0 to unlock.</p></TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input 
                className="h-9 text-sm" 
                type="number" 
                min={0} 
                max={30} 
                value={lockDurationDays} 
                onChange={e => setLockDurationDays(Number(e.target.value))} 
              />
            </div>
          </div>
        </div>
        
        <div className="flex items-center justify-between p-3 border rounded-lg bg-secondary/10">
          <div className="space-y-0.5">
            <Label className="text-xs font-bold">Show Entire Collection</Label>
            <p className="text-[10px] text-muted-foreground">Allows visitors to cycle through all tokens in this contract.</p>
          </div>
          <Switch 
            checked={currentConfig.show_collection || false} 
            onCheckedChange={v => setCurrentConfig(p => ({...p, show_collection: v}))} 
          />
        </div>

        <Button 
          className="w-full h-12 text-md font-bold" 
          onClick={handleSave} 
          disabled={isLoading || (selectedLock?.isLocked && !selectedLock?.isLockedByMe)}
        >
          {isLoading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : 'Apply Configuration'}
        </Button>
        
        {selectedLock?.isLocked && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-center">
            <p className="text-xs text-amber-500 font-medium">
              {selectedLock.isLockedByMe ? `Locked by you until ${selectedLock.lockedUntil?.toLocaleDateString()}` : "Locked by another curator."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsPanel;

//comment to update