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
  handleSave: () => Promise<void>;
  isLoading: boolean;
  // onOpenMap removed – map UI is no longer needed
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  selectedPanelKey,
  friendlyLabel,
  currentConfig,
  setCurrentConfig,
  handleSave,
  isLoading,
}) => {
  if (!selectedPanelKey) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center space-y-3 opacity-60 border-2 border-dashed rounded-xl">
        <MapIcon className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm">Select a panel from the list above to configure it.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="space-y-6 animate-in fade-in slide-in-from-top-1 duration-300">
        <div className="flex items-center justify-between p-3 border rounded-lg bg-secondary/10">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-tight">
              Active Selection
            </span>
            <span className="text-sm font-bold">{friendlyLabel}</span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Contract Address</Label>
            <Input
              className="h-9 text-sm font-mono"
              value={currentConfig.contract_address || ''}
              onChange={e => setCurrentConfig(p => ({ ...p, contract_address: e.target.value }))}
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
                onChange={e => setCurrentConfig(p => ({ ...p, default_token_id: parseInt(e.target.value) || 1 }))}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label className="text-xs">Show Collection</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">
                        When enabled, visitors can cycle through all tokens in this collection.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Switch
                checked={currentConfig.show_collection || false}
                onCheckedChange={v => setCurrentConfig(p => ({ ...p, show_collection: v }))}
              />
            </div>
          </div>
        </div>

        <Button
          className="w-full h-12 text-md font-bold"
          onClick={handleSave}
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : 'Apply Configuration'}
        </Button>
      </div>
    </div>
  );
};

export default SettingsPanel;