import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface NftDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
}

const NftDetailModal: React.FC<NftDetailModalProps> = ({ isOpen, onClose, title, description }) => {
  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-72 w-full rounded-md border p-4">
          <p className="text-sm text-muted-foreground">{description}</p>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default NftDetailModal;