import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ArrowLeft, UserCircle, CheckCircle2, AlertCircle, Loader2, Save, User } from 'lucide-react';
import { useAccount } from 'wagmi';
import { useAvatarConfig, AvatarState } from '@/hooks/use-avatar-config';
import { toast } from 'sonner';
import AvatarPreview from '@/components/AvatarPreview';

const AvatarConfig: React.FC = () => {
  const navigate = useNavigate();
  const { isConnected } = useAccount();
  const { avatarState, updateAvatarConfig, isLoading } = useAvatarConfig();
  const [isSaving, setIsSaving] = useState(false);

  // Local state for form - simplified to just handle the toggle
  const [enabled, setEnabled] = useState(avatarState.enabled);

  // Sync with hook when data loads
  React.useEffect(() => {
    setEnabled(avatarState.enabled);
  }, [avatarState]);

  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
        <Card className="w-full max-w-md text-center p-8">
          <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <CardTitle>Wallet Required</CardTitle>
          <CardDescription className="mt-2">Please connect your wallet to customize your avatar.</CardDescription>
          <Button onClick={() => navigate('/portal')} className="mt-6 w-full">Go to Portal</Button>
        </Card>
      </div>
    );
  }

  const handleSave = async () => {
    setIsSaving(true);
    // Always use 'silhouette' (mannequin) as the type now
    const success = await updateAvatarConfig({
      enabled,
      type: 'silhouette'
    });
    
    if (success) {
      toast.success("Avatar settings saved!");
    } else {
      toast.error("Failed to save avatar settings.");
    }
    setIsSaving(false);
  };

  const previewState: AvatarState = {
    enabled,
    type: 'silhouette'
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4 sm:p-8 flex items-center justify-center">
      <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        
        {/* Left: Configuration Form */}
        <Card className="shadow-xl border-t-4 border-t-primary h-fit">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                <UserCircle className="h-8 w-8" />
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate('/portal')}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Portal
              </Button>
            </div>
            <CardTitle className="mt-4 text-2xl">Identity Customisation</CardTitle>
            <CardDescription>
              Configure how you appear to others while exploring the gallery.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoading ? (
              <div className="flex flex-col items-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                <p className="text-sm text-muted-foreground">Retrieving profile...</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between p-5 border rounded-2xl bg-secondary/20 transition-all hover:bg-secondary/30">
                  <div className="space-y-0.5">
                    <Label className="text-base font-black uppercase tracking-tight">Enable 3D Avatar</Label>
                    <p className="text-xs text-muted-foreground">Project a 3D mannequin body onto your digital presence.</p>
                  </div>
                  <Switch checked={enabled} onCheckedChange={setEnabled} />
                </div>

                {enabled && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="p-5 rounded-2xl border-2 border-primary bg-primary/5 shadow-md flex items-center gap-4">
                      <div className="bg-primary/10 p-3 rounded-full">
                        <User className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex flex-col">
                        <div className="font-black text-sm uppercase tracking-tighter">Electro-Mannequin</div>
                        <div className="text-[10px] opacity-60">Standard interactive avatar enabled.</div>
                      </div>
                    </div>

                    <div className="p-4 bg-primary/5 border border-primary/10 rounded-xl flex gap-3 items-start">
                      <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                      <p className="text-xs leading-relaxed font-medium">
                        Your avatar is fully rigged. It will automatically play <strong>Idle</strong> and <strong>Walking</strong> animations based on your movements in the gallery.
                      </p>
                    </div>
                  </div>
                )}

                <Button className="w-full h-14 font-black text-lg uppercase tracking-wider shadow-lg" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? <Loader2 className="animate-spin h-5 w-5 mr-2" /> : <Save className="h-5 w-5 mr-2" />}
                  {isSaving ? "Saving..." : "Apply Changes"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Right: Live 3D Preview */}
        <div className="lg:sticky lg:top-8 h-[500px] lg:h-[700px] animate-in fade-in slide-in-from-right-4 duration-700">
          <AvatarPreview state={previewState} />
        </div>

      </div>
    </div>
  );
};

export default AvatarConfig;