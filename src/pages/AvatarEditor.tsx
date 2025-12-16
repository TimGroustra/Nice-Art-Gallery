import React from 'react';
import AvatarEditorUI from '@/components/AvatarEditorUI';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

const AvatarEditor: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <div className="p-4">
        <Button asChild variant="outline" className="mb-4">
          <Link to="/">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Gallery
          </Link>
        </Button>
        <AvatarEditorUI />
      </div>
    </div>
  );
};

export default AvatarEditor;