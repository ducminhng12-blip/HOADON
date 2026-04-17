export interface InvoiceData {
  date: string; // YYYYMMDD
  invoiceNumber: string;
  serial: string;
}

export interface FileItem {
  id: string;
  file: File;
  previewUrl: string;
  originalName: string;
  proposedName: string | null;
  status: 'pending' | 'scanning' | 'done' | 'error';
  error?: string;
  data?: InvoiceData;
  handle?: FileSystemFileHandle; // For File System Access API
}
