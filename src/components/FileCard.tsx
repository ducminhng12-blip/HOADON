import { cn } from "../lib/utils";
import { Trash2, AlertCircle, CheckCircle2, Loader2, Download } from "lucide-react";
import { FileItem } from "../types";

interface FileCardProps {
  item: FileItem;
  onRemove: (id: string) => void;
  onDownload: (item: FileItem) => void;
}

export function FileCard({ item, onRemove, onDownload }: FileCardProps) {
  return (
    <div className={cn(
      "group relative grid grid-cols-[2fr_3fr_1fr] items-center gap-4 py-4 bottom-border transition-all duration-200",
      item.status === 'scanning' ? "bg-accent-glow" : "hover:bg-bg-card/50"
    )}>
      {/* Original Name */}
      <div className="flex items-center gap-3 min-w-0 pl-1">
        <span className={cn(
          "h-2 w-2 rounded-full",
          item.status === 'done' ? "bg-emerald-400 accent-glow" : 
          item.status === 'error' ? "bg-red-500" : "bg-text-dim"
        )} />
        <span className="truncate text-[13px] text-text-dim group-hover:text-text-main transition-colors" title={item.originalName}>
          {item.originalName}
        </span>
      </div>

      {/* Proposed Name / Result */}
      <div className="flex items-center gap-2 min-w-0 font-mono">
        {item.proposedName ? (
           <span className="text-sm text-text-main truncate">
            {item.proposedName}.pdf
          </span>
        ) : item.status === 'scanning' ? (
          <span className="text-[11px] text-accent-gold italic animate-pulse">[Đang xử lý OCR...]</span>
        ) : item.status === 'error' ? (
          <span className="text-[11px] text-red-500 truncate" title={item.error}>[Lỗi: {item.error}]</span>
        ) : (
          <span className="text-[11px] text-text-dim italic">[Chờ xử lý]</span>
        )}
      </div>

      {/* Status & Actions */}
      <div className="flex items-center justify-end pr-1 text-[11px] uppercase tracking-widest font-medium">
        <div className="relative">
          <div className="flex items-center gap-1 group-hover:opacity-0 transition-opacity">
            {item.status === 'done' ? (
              <span className="text-emerald-400">Đã quét</span>
            ) : item.status === 'error' ? (
              <span className="text-red-500">Lỗi</span>
            ) : item.status === 'scanning' ? (
              <span className="text-accent-gold">Đang quét</span>
            ) : (
              <span className="text-text-dim">Chờ</span>
            )}
          </div>
          
          <div className="absolute inset-0 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {item.status === 'done' && (
              <button
                onClick={() => onDownload(item)}
                className="p-1.5 text-text-dim hover:text-accent-gold transition-colors"
                title="Tải về"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => onRemove(item.id)}
              className="p-1.5 text-text-dim hover:text-red-500 transition-colors"
              title="Xóa"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
