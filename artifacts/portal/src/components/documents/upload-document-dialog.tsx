import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useRequestDocumentUpload,
  getListFolderDocumentsQueryKey,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UploadCloud, FileText, X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".xlsx", ".pptx", ".jpg", ".jpeg", ".png", ".txt"];
const ALLOWED_ACCEPT = ALLOWED_EXTENSIONS.join(",");
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_MB = 20;

const EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  txt: "text/plain",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderId: string;
  folderTitle: string;
  onUploadSuccess?: (title: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadDocumentDialog({ open, onOpenChange, folderId, folderTitle, onUploadSuccess }: Props) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { mutateAsync: requestUpload } = useRequestDocumentUpload();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle("");
    setDescription("");
    setFile(null);
    setFileError(null);
    setError(null);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleOpenChange(val: boolean) {
    if (!uploading) {
      if (!val) reset();
      onOpenChange(val);
    }
  }

  function validateFile(f: File): string | null {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!EXT_TO_MIME[ext]) {
      return `File type .${ext} is not allowed. Accepted: PDF, DOCX, XLSX, PPTX, JPG, JPEG, PNG, TXT.`;
    }
    if (f.size > MAX_BYTES) {
      return `File is too large (${formatBytes(f.size)}). Maximum size is ${MAX_MB} MB.`;
    }
    if (f.size === 0) {
      return "File is empty.";
    }
    return null;
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f) {
      const err = validateFile(f);
      setFileError(err);
    } else {
      setFileError(null);
    }
  }

  function clearFile() {
    setFile(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    const validationError = validateFile(file);
    if (validationError) {
      setFileError(validationError);
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const mimeType = EXT_TO_MIME[ext] ?? file.type;

      const result = await requestUpload({
        data: {
          folderId,
          title: title.trim(),
          description: description.trim() || null,
          fileName: file.name,
          fileSize: file.size,
          mimeType,
        },
      });

      const putResponse = await fetch(result.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": mimeType },
        body: file,
      });

      if (!putResponse.ok) {
        throw new Error(`Upload failed (HTTP ${putResponse.status})`);
      }

      await queryClient.invalidateQueries({
        queryKey: getListFolderDocumentsQueryKey(folderId),
      });

      const uploadedTitle = title.trim();
      reset();
      onOpenChange(false);
      onUploadSuccess?.(uploadedTitle);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed. Please try again.";
      setError(msg);
      setUploading(false);
    }
  }

  const canSubmit = title.trim().length > 0 && file !== null && !fileError && !uploading;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-1 min-w-0 w-full">
          <div className="space-y-1.5">
            <Label htmlFor="doc-title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="doc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Meeting Minutes — March 2026"
              disabled={uploading}
              maxLength={200}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="doc-desc">Description</Label>
            <Textarea
              id="doc-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              disabled={uploading}
              maxLength={1000}
              rows={3}
              className="resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label>
              File <span className="text-destructive">*</span>
            </Label>

            {file ? (
              <div
                className={cn(
                  "flex items-center gap-3 rounded-md border p-3",
                  fileError ? "border-destructive/50 bg-destructive/5" : "border-card-border bg-muted/30"
                )}
              >
                <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                </div>
                {!uploading && (
                  <button
                    type="button"
                    onClick={clearFile}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ) : (
              <label
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-6 cursor-pointer transition-colors",
                  "border-card-border hover:border-primary/40 hover:bg-muted/20"
                )}
              >
                <UploadCloud className="h-8 w-8 text-muted-foreground/60" />
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">
                    Click to select a file
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    PDF, DOCX, XLSX, PPTX, JPG, PNG, TXT — max {MAX_MB} MB
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ALLOWED_ACCEPT}
                  onChange={handleFileChange}
                  className="sr-only"
                  disabled={uploading}
                />
              </label>
            )}

            {fileError && (
              <p className="text-xs text-destructive flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {fileError}
              </p>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Uploading to <span className="font-medium text-foreground">{folderTitle}</span>.
            Your document will be reviewed before it becomes visible to other members.
          </p>

          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2.5 text-sm text-destructive flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {uploading ? "Uploading…" : "Upload"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
