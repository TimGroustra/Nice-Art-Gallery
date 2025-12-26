import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, UserCircle, Construction } from 'lucide-react';
import { useAccount } from 'wagmi';

const AvatarConfig: React.FC = () => {
  const navigate = useNavigate();
  const { isConnected } = useAccount();

  // Basic security check
  React.useEffect(() => {
    if (!isConnected) {
      navigate('/portal');
    }
  }, [isConnected, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4 text-primary">
            <UserCircle className="h-8 w-8" />
          </div>
          <CardTitle>Edit Avatar</CardTitle>
          <CardDescription>
            Customize your 3D presence in the gallery.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 text-center py-8">
          <div className="flex flex-col items-center gap-4">
            <Construction className="h-12 w-12 text-muted-foreground animate-pulse" />
            <div className="space-y-2">
              <p className="font-medium">Avatar Customization Coming Soon</p>
              <p className="text-sm text-muted-foreground">
                We are currently building the integration with 3D avatar systems.
              </p>
            </div>
          </div>
          
          <Button onClick={() => navigate('/portal')} variant="outline" className="w-full">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Portal
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default AvatarConfig;