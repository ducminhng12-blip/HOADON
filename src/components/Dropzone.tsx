import { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { Upload, FileUp } from 'lucide-react';
import { cn } from '../lib/utils';

interface DropzoneProps {
  onFilesAdded: (files: File[]) => void;
  className?: string;
}

export function Dropzone({ onFilesAdded, className }: DropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (!e.dataTransfer.files) return;
    
    const files = Array.from(e.dataTransfer.files as FileList).filter(f => f.type === 'application/pdf');
    if (files.length > 0) {
      onFilesAdded(files);
    }
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files as FileList).filter(f => f.type === 'application/pdf');
      onFilesAdded(files);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "relative group cursor-pointer overflow-hidden transition-all duration-300 border",
        isDragging 
          ? "border-accent-gold bg-accent-glow" 
          : "border-border-dim hover:border-accent-gold bg-bg-card",
        className
      )}
    >
      <input
        type="file"
        ref={inputRef}
        onChange={handleFileInput}
        accept="application/pdf"
        multiple
        className="hidden"
      />
      
      <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
        <div className={cn(
          "mb-3 flex h-12 w-12 items-center justify-center rounded-full transition-all duration-300",
          isDragging ? "text-accent-gold scale-110" : "text-text-dim group-hover:text-accent-gold"
        )}>
          {isDragging ? <FileUp className="h-6 w-6" /> : <Upload className="h-6 w-6" />}
        </div>
        
        <h3 className="text-sm font-sans not-italic font-semibold text-text-main">Tải lên hóa đơn Petrolimex</h3>
        <p className="mt-1 text-[11px] uppercase tracking-wider text-text-dim max-w-[200px] mx-auto">
          Kéo thả tệp PDF vào đây
        </p>
      </div>
    </div>
  );
}
