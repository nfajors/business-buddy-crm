import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { csvToContacts, type CsvParseResult } from "@/lib/csv";
import { useBulkImportContacts } from "@/lib/mutations";
import { useAuth } from "@/hooks/useAuth";

export function ImportContactsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user } = useAuth();
  const importer = useBulkImportContacts();
  const [preview, setPreview] = useState<CsvParseResult | null>(null);
  const [filename, setFilename] = useState<string>("");

  const onFile = async (file: File) => {
    const text = await file.text();
    const parsed = csvToContacts(text, { created_by: user?.id, owner_id: user?.id });
    setPreview(parsed);
    setFilename(file.name);
    if (parsed.rows.length === 0) toast.error("No valid rows found in this CSV.");
  };

  const reset = () => { setPreview(null); setFilename(""); };

  const submit = async () => {
    if (!preview || preview.rows.length === 0) return;
    await importer.mutateAsync(preview.rows);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import contacts from CSV</DialogTitle>
          <DialogDescription>
            Expected headers: First Name, Last Name, Title, Company, Email, Work Phone, Mobile Phone, LinkedIn, Website, Industry, City, State, Country, Stage.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Input type="file" accept=".csv,text/csv" onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }} />
          {preview && (
            <div className="text-sm space-y-2">
              <div className="font-medium">{filename}</div>
              <div>
                Ready to import <strong>{preview.rows.length}</strong> contact{preview.rows.length === 1 ? "" : "s"}.
              </div>
              {preview.skipped.length > 0 && (
                <div className="text-destructive">
                  Skipping {preview.skipped.length} row{preview.skipped.length === 1 ? "" : "s"}:
                  <ul className="list-disc ml-5 max-h-32 overflow-auto text-xs">
                    {preview.skipped.slice(0, 20).map((s) => (
                      <li key={s.rowIndex}>Row {s.rowIndex}: {s.reason}</li>
                    ))}
                    {preview.skipped.length > 20 && <li>…and {preview.skipped.length - 20} more</li>}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!preview || preview.rows.length === 0 || importer.isPending}>
            {importer.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Import {preview ? `${preview.rows.length} contacts` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}