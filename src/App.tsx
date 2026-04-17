/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useRef, ChangeEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  FileSearch, 
  Trash2, 
  Download, 
  Files, 
  RefreshCw, 
  Settings2,
  FileCheck,
  FileText,
  FolderOpen,
  AlertCircle,
  ExternalLink
} from "lucide-react";
import JSZip from "jszip";
import { saveAs } from "file-saver";

import { Dropzone } from "./components/Dropzone";
import { FileCard } from "./components/FileCard";
import { pdfToImage } from "./lib/pdf";
import { extractInvoiceData } from "./lib/gemini";
import { FileItem } from "./types";
import { cn } from "./lib/utils";

export default function App() {
  const [items, setItems] = useState<FileItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [saveMode, setSaveMode] = useState<'zip' | 'inplace'>('zip');
  const [isDownloadConfirmOpen, setIsDownloadConfirmOpen] = useState(false);
  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const isInIframe = window.self !== window.top;

  const handleFilesAdded = useCallback((files: File[]) => {
    const newItems: FileItem[] = files.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      previewUrl: "",
      originalName: file.name,
      proposedName: null,
      status: 'pending'
    }));

    setItems(prev => [...prev, ...newItems]);
  }, []);

  const handleFolderInput = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const fileList = Array.from(files) as File[];
    const pdfFiles = fileList.filter(file => file.name.toLowerCase().endsWith('.pdf'));
    const newItems: FileItem[] = pdfFiles.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      previewUrl: "",
      originalName: file.name,
      proposedName: null,
      status: 'pending'
    }));

    setItems(prev => [...prev, ...newItems]);
    setDirectoryHandle(null); 
    setSaveMode('zip'); // Standard inputs don't allow in-place saving
  };

  const selectFolder = async () => {
    // If in iframe, we use the fallback input because showDirectoryPicker is blocked
    if (isInIframe || !('showDirectoryPicker' in window)) {
      folderInputRef.current?.click();
      return;
    }

    try {
      const handle = await (window as any).showDirectoryPicker();
      setDirectoryHandle(handle);
      setSaveMode('inplace');

      const foundFiles: FileItem[] = [];
      
      async function scanDirectory(dirHandle: FileSystemDirectoryHandle) {
        for await (const entry of (dirHandle as any).values()) {
          if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.pdf')) {
            const file = await entry.getFile();
            foundFiles.push({
              id: Math.random().toString(36).substring(7),
              file,
              previewUrl: "",
              originalName: file.name,
              proposedName: null,
              status: 'pending',
              handle: entry as FileSystemFileHandle
            });
          } else if (entry.kind === 'directory') {
            await scanDirectory(entry);
          }
        }
      }

      await scanDirectory(handle);
      setItems(prev => [...prev, ...foundFiles]);
    } catch (err) {
      console.error("Lỗi chọn thư mục:", err);
    }
  };

  const removeItem = useCallback((id: string) => {
    setItems(prev => {
      const item = prev.find(i => i.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter(i => i.id !== id);
    });
  }, []);

  const processFile = async (item: FileItem) => {
    try {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'scanning' } : i));
      
      const imageUrl = await pdfToImage(item.file);
      const data = await extractInvoiceData(imageUrl);
      const proposedName = `${data.date} ${data.invoiceNumber} ${data.serial}`;
      
      // Handle In-place saving (renaming/overwriting logic)
      if (saveMode === 'inplace' && item.handle && directoryHandle) {
        try {
          const newFileName = `${proposedName}.pdf`;
          
          // Overwrite/Save: If name is different, we create a new file and optionally remove old one
          // Browser File System API doesn't have native "move" everywhere, so we copy + delete
          if (newFileName !== item.originalName) {
            const newFileHandle = await directoryHandle.getFileHandle(newFileName, { create: true });
            const writable = await (newFileHandle as any).createWritable();
            await writable.write(item.file);
            await writable.close();
            
            // To be safe and purely "rename" (overwrite logic), you could remove the old one:
            // await directoryHandle.removeEntry(item.originalName);
          } else {
            // If name is same, just overwrite content (though content shouldn't change for OCR)
            const writable = await (item.handle as any).createWritable();
            await writable.write(item.file);
            await writable.close();
          }
        } catch (saveErr) {
          console.error("Lỗi lưu file:", saveErr);
          throw new Error("Không thể ghi file vào thư mục. Hãy kiểm tra quyền truy cập.");
        }
      }

      setItems(prev => prev.map(i => i.id === item.id ? { 
        ...i, 
        status: 'done', 
        data, 
        proposedName,
        previewUrl: imageUrl 
      } : i));
    } catch (error) {
      console.error(error);
      setItems(prev => prev.map(i => i.id === item.id ? { 
        ...i, 
        status: 'error', 
        error: error instanceof Error ? error.message : "Lỗi xử lý file" 
      } : i));
    }
  };

  const processAll = async () => {
    const pendingItems = items.filter(i => i.status === 'pending' || i.status === 'error');
    if (pendingItems.length === 0) return;

    setIsProcessing(true);
    
    // Process in batches of 3 to speed up while avoiding rate limits
    const CONCURRENCY = 3;
    for (let i = 0; i < pendingItems.length; i += CONCURRENCY) {
      const batch = pendingItems.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(item => processFile(item)));
    }

    setIsProcessing(false);
  };

  const downloadFile = (item: FileItem) => {
    if (!item.proposedName) return;
    saveAs(item.file, `${item.proposedName}.pdf`);
  };

  const downloadAll = async () => {
    const doneItems = items.filter(i => i.status === 'done' && i.proposedName);
    if (doneItems.length === 0) return;

    setIsDownloadConfirmOpen(false);
    const zip = new JSZip();
    doneItems.forEach(item => {
      zip.file(`${item.proposedName}.pdf`, item.file);
    });

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `invoice-renamed-${new Date().toISOString().split('T')[0]}.zip`);
  };

  const clearDone = () => {
    setItems(prev => prev.filter(i => i.status !== 'done'));
  };

  const stats = {
    pending: items.filter(i => i.status === 'pending').length,
    scanning: items.filter(i => i.status === 'scanning').length,
    done: items.filter(i => i.status === 'done').length,
    error: items.filter(i => i.status === 'error').length,
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Hidden Folder Input for Fallback */}
      <input
        type="file"
        ref={folderInputRef}
        onChange={handleFolderInput}
        className="hidden"
        {...({ webkitdirectory: "", directory: "" } as any)}
        multiple
      />

      {/* Header */}
      <header className="h-20 shrink-0 px-10 flex items-center justify-between bg-bg-card bottom-border z-10 text-text-main font-serif italic">
        <div className="flex items-center gap-3">
          <div className="h-5 w-1 bg-accent-gold accent-glow" />
          <h1 className="text-xl tracking-wide not-italic font-serif">Petrolimex OCR Processor</h1>
        </div>
        <div className="flex items-center gap-4">
          {directoryHandle && (
            <div className="flex items-center gap-2 px-3 py-1 bg-accent-glow border border-accent-gold/20 rounded text-accent-gold text-[10px] font-mono not-italic uppercase tracking-wider">
              <FolderOpen className="h-3.5 w-3.5" />
              <span>{directoryHandle.name}</span>
            </div>
          )}
          <div className="px-3 py-1 border border-accent-gold text-accent-gold text-[10px] uppercase tracking-[0.2em] font-semibold not-italic">
            PRO Edition v5.0
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-80 sidebar-border bg-bg-deep p-8 flex flex-col gap-8 shrink-0 overflow-y-auto">
          {/* Output Strategy */}
          <div className="flex flex-col gap-3">
            <span className="text-[10px] text-text-dim uppercase tracking-widest font-bold">Chế độ đầu ra</span>
            <div className="grid grid-cols-2 gap-px bg-border-dim border border-border-dim overflow-hidden">
              <button 
                onClick={() => setSaveMode('zip')}
                className={cn(
                  "py-2.5 text-[10px] uppercase tracking-wider font-bold transition-all",
                  saveMode === 'zip' ? "bg-accent-gold text-black" : "bg-bg-deep text-text-dim hover:text-text-main"
                )}
              >
                Nén ZIP
              </button>
              <button 
                onClick={() => !isInIframe && setSaveMode('inplace')}
                disabled={isInIframe}
                className={cn(
                  "py-2.5 text-[10px] uppercase tracking-wider font-bold transition-all",
                  saveMode === 'inplace' ? "bg-accent-gold text-black" : "bg-bg-deep text-text-dim hover:text-text-main",
                  isInIframe && "opacity-30 cursor-not-allowed"
                )}
                title={isInIframe ? "Mở trong tab mới để dùng tính năng này" : "Lưu kết quả trực tiếp vào thư mục"}
              >
                Lưu Thư Mục
              </button>
            </div>
            {saveMode === 'inplace' && !directoryHandle && (
              <p className="text-[10px] text-accent-gold italic flex items-center gap-1.5 px-1">
                <AlertCircle className="h-3 w-3" /> Cần chọn thư mục đích
              </p>
            )}
          </div>

          {/* Directory Picker */}
          <div className="flex flex-col gap-3">
            <span className="text-[10px] text-text-dim uppercase tracking-widest font-bold">Quét Thư Mục (Batch)</span>
            <button
              onClick={selectFolder}
              className="flex items-center justify-center gap-2.5 w-full py-3.5 bg-bg-card border border-border-dim text-text-main hover:border-accent-gold transition-all text-[11px] uppercase tracking-widest font-bold"
            >
              <FolderOpen className="h-4 w-4 text-accent-gold" />
              Chọn Thư Mục PDF
            </button>
            {isInIframe ? (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded space-y-2">
                <p className="text-[10px] text-red-500 leading-tight">
                  <span className="font-bold">Hạn chế:</span> Trình duyệt chặn chọn thư mục trực tiếp trong Preview.
                </p>
                <p className="text-[10px] text-text-dim leading-tight">
                  Bạn vẫn có thể quét, nhưng hãy <span className="text-accent-gold font-bold italic underline">Mở trong tab mới</span> để dùng tính năng "Lưu Thư Mục".
                </p>
              </div>
            ) : (
              <p className="text-[10px] text-text-dim italic leading-relaxed">Hệ thống sẽ quét mọi tệp PDF bên trong thư mục đã chọn.</p>
            )}
          </div>

          {/* Quick Upload Backup */}
          <div className="flex flex-col gap-3">
            <span className="text-[10px] text-text-dim uppercase tracking-widest font-bold">Tải tệp thủ công</span>
            <Dropzone onFilesAdded={handleFilesAdded} />
          </div>

          <div className="mt-auto pt-6 top-border flex flex-col gap-3">
            <button
              onClick={processAll}
              disabled={isProcessing || (stats.pending === 0 && stats.error === 0)}
              className="w-full py-4 bg-accent-gold text-black text-[11px] font-bold uppercase tracking-[0.2em] hover:brightness-110 disabled:opacity-30 disabled:grayscale transition-all active:scale-[0.98] accent-glow"
            >
              {isProcessing ? "Đang xử lý tài liệu..." : "Bắt đầu quét hoá đơn"}
            </button>
          </div>
        </aside>

        {/* Content Area */}
        <section className="flex-1 bg-bg-deep flex flex-col min-w-0">
          {/* List Header */}
          <div className="grid grid-cols-[2fr_3fr_1fr] px-10 py-4 bottom-border bg-bg-card/40">
            <span className="text-[10px] text-text-dim uppercase tracking-widest font-bold">File gốc</span>
            <span className="text-[10px] text-text-dim uppercase tracking-widest font-bold">Gợi ý tên file (OCR)</span>
            <span className="text-[10px] text-text-dim uppercase tracking-widest font-bold text-right">Trạng thái</span>
          </div>

          {/* List Body */}
          <div className="flex-1 overflow-y-auto px-10 custom-scrollbar">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-20 gap-5 text-center">
                <FileSearch className="h-12 w-12 text-text-dim" />
                <div className="space-y-1">
                  <p className="text-sm uppercase tracking-[0.3em] font-light text-text-main">Trung tâm xử lý trống</p>
                  <p className="text-[10px] uppercase tracking-[0.1em] text-text-dim">Mở thư mục cục bộ hoặc kéo thả tệp hóa đơn vào đây</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col min-h-full pb-20">
                <AnimatePresence mode="popLayout">
                  {items.map((item) => (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.2 }}
                    >
                      <FileCard 
                        item={item} 
                        onRemove={removeItem} 
                        onDownload={downloadFile}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="h-14 shrink-0 px-10 flex items-center justify-between bg-bg-card top-border text-[11px] text-text-dim font-sans overflow-x-auto whitespace-nowrap">
        <div className="flex items-center gap-8">
          <div>Hàng đợi: <span className="text-text-main font-bold ml-1.5">{items.length}</span></div>
          <div>Hoàn tất: <span className="text-emerald-400 font-bold ml-1.5">{stats.done}</span></div>
          {stats.error > 0 && <div>Lỗi: <span className="text-red-500 font-bold ml-1.5">{stats.error}</span></div>}
        </div>
        
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-6">
            {saveMode === 'zip' ? (
              <button 
                onClick={() => setIsDownloadConfirmOpen(true)}
                disabled={stats.done === 0 || isProcessing}
                className="text-text-main hover:text-accent-gold underline underline-offset-4 disabled:opacity-30 uppercase tracking-widest text-[9px] font-bold"
              >
                Tải ZIP kết quả
              </button>
            ) : (
              <span className="text-emerald-400 text-[9px] font-bold uppercase tracking-widest flex items-center gap-2">
                <FileCheck className="h-3 w-3" /> Tự động lưu thư mục
              </span>
            )}
            <button 
              onClick={clearDone}
              disabled={stats.done === 0 || isProcessing}
              className="text-text-dim hover:text-red-400 underline underline-offset-4 disabled:opacity-30 uppercase tracking-widest text-[9px] font-bold"
            >
              Dọn dẹp danh sách
            </button>
          </div>
          <div className="h-6 w-px bg-border-dim" />
          <span className="text-accent-gold/40 uppercase tracking-[0.2em] font-semibold text-[10px]">Petrolimex Engine 2026</span>
        </div>
      </footer>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {isDownloadConfirmOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="w-full max-w-sm bg-bg-card border border-accent-gold/30 p-8 shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-accent-gold/5 blur-3xl rounded-full -mr-16 -mt-16 pointer-events-none" />
              
              <div className="relative flex flex-col items-center text-center gap-6">
                <div className="p-4 rounded-full bg-accent-gold/10 border border-accent-gold/20">
                  <Download className="h-8 w-8 text-accent-gold" />
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-lg font-serif italic text-text-main tracking-wide">Xác nhận tải File</h3>
                  <p className="text-[11px] text-text-dim leading-relaxed uppercase tracking-widest font-medium">
                    Bạn chuẩn bị tải xuống toàn bộ <span className="text-accent-gold">{stats.done}</span> hóa đơn đã xử lý dưới định dạng .ZIP
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-px bg-border-dim border border-border-dim w-full mt-2">
                  <button 
                    onClick={() => setIsDownloadConfirmOpen(false)}
                    className="py-4 text-[10px] uppercase tracking-[0.2em] font-bold bg-bg-deep text-text-dim hover:text-text-main transition-colors"
                  >
                    Hủy bỏ
                  </button>
                  <button 
                    onClick={downloadAll}
                    className="py-4 text-[10px] uppercase tracking-[0.2em] font-bold bg-accent-gold text-black hover:brightness-110 transition-all accent-glow"
                  >
                    Tải ngay
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

