import React from "react";
import { AvatarProfile } from "./AvatarTypes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

interface AvatarCustomizerPanelProps {
  profile: AvatarProfile;
  onChange: (newProfile: AvatarProfile) => void;
}

export function AvatarCustomizerPanel({
  profile,
  onChange,
}: AvatarCustomizerPanelProps) {
  const handleSliderChange = (key: keyof AvatarProfile, value: number[]) => {
    onChange({ ...profile, [key]: value[0] });
  };

  const handleSelectChange = (key: keyof AvatarProfile, value: string) => {
    onChange({ ...profile, [key]: value });
  };

  const handleColorChange = (key: keyof AvatarProfile, e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...profile, [key]: e.target.value });
  };

  const handleSwitchChange = (key: keyof AvatarProfile, checked: boolean) => {
    onChange({ ...profile, [key]: checked });
  };

  return (
    <Card className="w-full max-w-xs bg-background/90 backdrop-blur-sm shadow-lg">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-lg">Avatar Customizer</CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4 text-sm">
        
        {/* Physical Sliders */}
        <div className="space-y-3">
          <Label>Height ({profile.height.toFixed(2)})</Label>
          <Slider
            min={0.9}
            max={1.1}
            step={0.01}
            value={[profile.height]}
            onValueChange={(v) => handleSliderChange("height", v)}
          />

          <Label>Build ({profile.build.toFixed(2)})</Label>
          <Slider
            min={0.8}
            max={1.2}
            step={0.01}
            value={[profile.build]}
            onValueChange={(v) => handleSliderChange("build", v)}
          />

          <Label>Head Size ({profile.headSize.toFixed(2)})</Label>
          <Slider
            min={0.9}
            max={1.1}
            step={0.01}
            value={[profile.headSize]}
            onValueChange={(v) => handleSliderChange("headSize", v)}
          />
        </div>

        <Separator />

        {/* Colors */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="skinTone">Skin Tone</Label>
            <Input
              id="skinTone"
              type="color"
              value={profile.skinTone}
              onChange={(e) => handleColorChange("skinTone", e)}
              className="h-8 p-1"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hairColor">Hair Color</Label>
            <Input
              id="hairColor"
              type="color"
              value={profile.hairColor}
              onChange={(e) => handleColorChange("hairColor", e)}
              className="h-8 p-1"
            />
          </div>
        </div>
        
        <Separator />

        {/* Hair and Beard */}
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Hair Style</Label>
            <Select
              value={profile.hairStyle}
              onValueChange={(v) => handleSelectChange("hairStyle", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select style" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="short">Short</SelectItem>
                <SelectItem value="bun">Bun</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="hasBeard">Has Beard</Label>
            <Switch
              id="hasBeard"
              checked={profile.hasBeard}
              onCheckedChange={(checked) => handleSwitchChange("hasBeard", checked)}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}