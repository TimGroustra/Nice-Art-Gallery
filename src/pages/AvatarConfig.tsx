import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ArrowLeft, UserCircle, CheckCircle2, AlertCircle, Loader2, Smartphone, User, Save } from 'lucide-react';
import { useAccount } from 'wagmi';
import { useAvatarConfig, AvatarState } from '@/hooks/use-avatar-config';
import { toast } from 'sonner';
import AvatarPreview from '@/components/AvatarPreview';

const AvatarConfig: React.FC = () => {
  const navigate = useNavigate();
  const { isConnected } = useAccount();
  const { avatarState, updateAvatarConfig, isLoading } = useAvatarConfig();
  const [isSaving, setIsSaving] = useState(false);

  // Local state for form
  const [enabled, setEnabled] = useState(avatarState.enabled);
  const [type, setType] = useState(avatarState.type);
  const [url, setUrl] = useState(avatarState.url || '');

  // Sync with hook when data loads
  React.useEffect(() => {
    setEnabled(avatarState.enabled);
    setType(avatarState.type);
    setUrl(avatarState.url || '');
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
    const success = await updateAvatarConfig({
      enabled,
      type,
      url: type === 'rpm' ? url : undefined
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
    type,
    url
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
                    <p className="text-xs text-muted-foreground">Project a 3D body onto your digital presence.</p>
                  </div>
                  <Switch checked={enabled} onCheckedChange={setEnabled} />
                </div>

                {enabled && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setType('silhouette')}
                        className={`p-5 rounded-2xl border-2 text-left transition-all ${type === 'silhouette' ? 'border-primary bg-primary/5 shadow-md' : 'border-transparent bg-secondary/40 hover:bg-secondary/60'}`}
                      >
                        <User className={`h-6 w-6 mb-2 ${type === 'silhouette' ? 'text-primary' : 'text-muted-foreground'}`} />
                        <div className="font-black text-sm uppercase tracking-tighter">Silhouette</div>
                        <div className="text-[10px] opacity-60 mt-1">Simple grey mannequin. Minimal performance impact.</div>
                      </button>
                      <button
                        onClick={() => setType('rpm')}
                        className={`p-5 rounded-2xl border-2 text-left transition-all ${type === 'rpm' ? 'border-primary bg-primary/5 shadow-md' : 'border-transparent bg-secondary/40 hover:bg-secondary/60'}`}
                      >
                        <Smartphone className={`h-6 w-6 mb-2 ${type === 'rpm' ? 'text-primary' : 'text-muted-foreground'}`} />
                        <div className="font-black text-sm uppercase tracking-tighter">Custom GLB</div>
                        <div className="text-[10px] opacity-60 mt-1">Ready Player Me or any custom .glb model.</div>
                      </button>
                    </div>

                    {type === 'rpm' && (
                      <div className="space-y-2 animate-in fade-in duration-300">
                        <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Model Endpoint (GLB URL)</Label>
                        <Input 
                          placeholder="https://models.readyplayer.me/..." 
                          value={url} 
                          onChange={(e) => setUrl(e.target.value)}
                          className="h-12 text-xs font-mono bg-secondary/10"
                        />
                        <p className="text-[10px] text-muted-foreground pl-1">Provide a direct link to your avatar's .glb file.</p>
                      </div>
                    )}

                    <div className="p-4 bg-primary/5 border border-primary/10 rounded-xl flex gap-3 items-start">
                      <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                      <p className="text-xs leading-relaxed font-medium">
                        Your avatar is fully rigged. It will automatically play <strong>Idle</strong> and <strong>Walking</strong> animations based on your movements.
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