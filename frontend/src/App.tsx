
import React, { useCallback, useRef, useState } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// --- Types ---
interface UploadedDocMeta {
  documentId: string; // documentId from server
  name: string;
  size: number; // bytes
  pages: number;
}

interface Row extends UploadedDocMeta {
  key: string; // local stable key
  split: string; // e.g., "1-3,5"
}

// --- Utils ---
const human = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"] as const;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
};

const isValidSplit = (value: string, max: number) => {
  if (!value.trim()) return false;
  const parts = value.split(",").map((s) => s.trim()).filter(Boolean);
  const re = /^(\d+)(-(\d+))?$/;
  for (const p of parts) {
    const m = p.match(re);
    if (!m) return false;
    const a = parseInt(m[1], 10);
    const b = m[3] ? parseInt(m[3], 10) : a;
    if (a < 1 || b < 1 || a > max || b > max || a > b) return false;
  }
  return true;
};

const defaultSplitForPages = (pages: number) => `1-${pages}`;

// --- Sortable Row ---
function SortableRow({ row, onChange, onDelete, onCopy }: {
  row: Row;
  onChange: (key: string, split: string) => void;
  onDelete: (key: string) => void;
  onCopy: (key: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.key });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const valid = isValidSplit(row.split, row.pages);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      title="Drag to reorder"
      className="group grid grid-cols-[20px_1fr_auto_auto_auto] items-center gap-3 border-2 border-neutral-300 bg-white p-4 shadow-[2px_2px_0_0_#d4d4d4] hover:shadow-[3px_3px_0_0_#111] hover:border-neutral-900 cursor-grab transition-all"
    >
      {/* Drag indicator (entire row is draggable) */}
      <div
        className="h-4 w-4 flex items-center justify-center border-2 border-neutral-300 bg-neutral-100 text-neutral-500 transition-all group-hover:border-neutral-900 group-hover:bg-yellow-300"
        aria-hidden
      >
        <span className="text-xs">⋮⋮</span>
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-yellow-400" />
          <div className="truncate font-mono text-sm font-bold">{row.name}</div>
        </div>
        <div className="mt-1 flex flex-wrap gap-3 text-xs text-neutral-600 font-mono">
          <span>{human(row.size)}</span>
          <span>•</span>
          <span>{row.pages} page{row.pages === 1 ? "" : "s"}</span>
        </div>
      </div>

      <label className="sr-only" htmlFor={`split-${row.key}`}>Split pattern</label>
      <input
        id={`split-${row.key}`}
        value={row.split}
        onChange={(e) => onChange(row.key, e.target.value)}
        placeholder="e.g., 1-4,10,12-14"
        className={`w-[280px] border-2 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 transition-all ${
          valid ? "border-neutral-300 focus:ring-yellow-400 focus:border-yellow-400" : "border-red-400 focus:ring-red-400 bg-red-50"
        }`}
      />

      <button
        onClick={() => onCopy(row.key)}
        className="border-2 border-neutral-900 bg-white px-3 py-2 font-mono text-sm hover:bg-neutral-50 transition-all"
      >
        Copy
      </button>

      <button
        onClick={() => onDelete(row.key)}
        className="border-2 border-red-400 bg-white px-3 py-2 font-mono text-sm text-red-600 hover:bg-red-50 transition-all"
      >
        Delete
      </button>
    </div>
  );
}

// --- Main App ---
export default function App({ modalName = "name" }: { modalName?: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outputName, setOutputName] = useState<string>("merged.pdf");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  const onDragEnd = (event: any) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = rows.findIndex((r) => r.key === active.id);
      const newIndex = rows.findIndex((r) => r.key === over.id);
      setRows((prev) => arrayMove(prev, oldIndex, newIndex));
    }
  };

  const triggerFile = () => fileInputRef.current?.click();

  const uploadPDF = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", new File([file], file.name, { type: "application/pdf" }));
      const res = await fetch(`https://${modalName}--splitter-splitter-app.modal.run/upload`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      const meta: UploadedDocMeta = await res.json();
      const newRow: Row = {
        key: crypto.randomUUID(),
        documentId: meta.documentId,
        name: file.name,
        size: meta.size,
        pages: meta.pages,
        split: defaultSplitForPages(meta.pages),
      };
      setRows((r) => [...r, newRow]);
    } catch (e: any) {
      setError(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    await uploadPDF(f);
    // allow re-selecting same file
    e.currentTarget.value = "";
  };

  const onDrop = useCallback(async (ev: React.DragEvent) => {
    ev.preventDefault();
    const file = ev.dataTransfer.files?.[0];
    if (file && file.type === "application/pdf") await uploadPDF(file);
  }, []);

  const onPaste = useCallback(async (ev: React.ClipboardEvent) => {
    const item = Array.from(ev.clipboardData.items).find((i) => i.type === "application/pdf");
    if (item) {
      const file = item.getAsFile();
      if (file) await uploadPDF(file);
    }
  }, []);

  const updateSplit = (key: string, split: string) => setRows((rows) => rows.map((r) => (r.key === key ? { ...r, split } : r)));
  const deleteRow = (key: string) => setRows((rows) => rows.filter((r) => r.key !== key));
  const duplicateRow = (key: string) => {
    setRows((rows) => {
      const index = rows.findIndex((r) => r.key === key);
      if (index === -1) return rows;
      const original = rows[index];
      const copy: Row = { ...original, key: crypto.randomUUID() };
      return [...rows.slice(0, index + 1), copy, ...rows.slice(index + 1)];
    });
  };

  const canGenerate = rows.length > 0 && rows.every((r) => isValidSplit(r.split, r.pages));

  const generate = async () => {
    if (!canGenerate) return;
    setLoading(true);
    setError(null);
    try {
      const payload = {
        filename: outputName || "merged.pdf",
        documents: rows.map((r) => ({ documentId: r.documentId, split: r.split })),
      };
      const res = await fetch(`https://${modalName}--splitter-splitter-app.modal.run/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Split failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = outputName || "merged.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message || "Split failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f3ef] text-neutral-900" onDragOver={(e) => e.preventDefault()} onDrop={onDrop} onPaste={onPaste}>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="border-2 border-neutral-900 bg-white shadow-[6px_6px_0_0_#111]">
          {/* Header */}
          <div className="bg-neutral-50 p-6 border-b-2 border-neutral-200">
            <h1 className="font-mono text-xl font-bold text-neutral-900">PDF Splitter & Merger</h1>
            <p className="mt-1 font-mono text-sm text-neutral-600">
              Upload PDFs, define split ranges per file (e.g., <span className="bg-neutral-100 px-1">1-4,10,12-14</span>), reorder files, and generate a merged download.&nbsp;
              <a className="underline text-yellow-500 font-medium hover:text-yellow-400" href="https://github.com/jbarrow/pdfsplitter" target="_blank">Built with formalpdf</a>.
            </p>
          </div>

          <div className="p-6 space-y-6">
            {/* Document List Section */}
            {rows.length > 0 && (
              <div>
                <label className="font-mono text-sm font-bold mb-3 block">Documents</label>
                <div className="space-y-3">
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                    <SortableContext items={rows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
                      {rows.map((row) => (
                        <SortableRow key={row.key} row={row} onChange={updateSplit} onDelete={deleteRow} onCopy={duplicateRow} />
                      ))}
                    </SortableContext>
                  </DndContext>
                </div>
              </div>
            )}

            {/* Add PDF Section */}
            <div className={rows.length > 0 ? "border-t-2 border-neutral-200 pt-6" : ""}>
              <label className="font-mono text-sm font-bold mb-2 block">Add PDF</label>
              <div className="flex items-center gap-3 flex-wrap">
                <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={onFileChange} />
                <button
                  onClick={triggerFile}
                  disabled={uploading}
                  className={`border-2 border-neutral-900 px-5 py-2 font-mono text-sm transition-all ${
                    uploading
                      ? "cursor-not-allowed bg-neutral-200 text-neutral-500"
                      : "bg-white hover:bg-neutral-50"
                  }`}
                >
                  {uploading ? "Uploading..." : "Choose File"}
                </button>

                {uploading && (
                  <div className="flex items-center gap-2 font-mono text-sm text-neutral-600">
                    <div className="h-3 w-3 border-2 border-neutral-600 border-t-transparent rounded-full animate-spin" />
                    <span>Uploading...</span>
                  </div>
                )}

                {!uploading && (
                  <span className="font-mono text-sm text-neutral-500">or drop/paste a PDF anywhere</span>
                )}
              </div>
            </div>

            {/* Output & Generate Section */}
            {rows.length > 0 && (
              <div className="border-t-2 border-neutral-200 pt-6">
                <label className="font-mono text-sm font-bold mb-3 block">Output Settings</label>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="font-mono text-sm" htmlFor="out">Filename:</label>
                    <input
                      id="out"
                      value={outputName}
                      onChange={(e) => setOutputName(e.target.value)}
                      className="w-[240px] border-2 border-neutral-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                    />
                  </div>

                  <button
                    disabled={!canGenerate || loading}
                    onClick={generate}
                    className={`border-2 border-neutral-900 px-6 py-3 font-mono text-sm font-bold transition-all ${
                      canGenerate && !loading
                        ? "bg-yellow-300 hover:bg-yellow-400"
                        : "cursor-not-allowed bg-neutral-200 text-neutral-500"
                    }`}
                  >
                    {loading ? "Generating..." : "Generate Merge"}
                  </button>
                </div>

                {error && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200">
                    <span className="font-mono text-sm text-red-900">{error}</span>
                  </div>
                )}
              </div>
            )}

            {/* Tips Section */}
            {rows.length > 0 && (
              <div className="border-t-2 border-neutral-200 pt-6">
                <div className="bg-neutral-50 p-4 border-2 border-neutral-200">
                  <div className="mb-2 flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-yellow-400" />
                    <div className="font-mono text-sm font-bold">Tips</div>
                  </div>
                  <ul className="space-y-1.5 font-mono text-xs text-neutral-600">
                    <li className="flex items-start gap-2">
                      <span className="text-neutral-400">•</span>
                      <span>Split syntax supports single pages (<code className="bg-white px-1">3</code>) and ranges (<code className="bg-white px-1">2-5</code>), separated by commas.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-neutral-400">•</span>
                      <span>Validation enforces bounds by page count. Red input = invalid.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-neutral-400">•</span>
                      <span>Order of rows = order in the final merged file. Drag to reorder.</span>
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Notice */}
        <div className="mt-6 border-2 border-neutral-300 bg-white/50 backdrop-blur-sm p-5 shadow-[3px_3px_0_0_rgba(0,0,0,0.1)]">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <p className="font-mono text-xs text-neutral-600 leading-relaxed">
              All documents get auto-deleted shortly after running.
            </p>
            <a
              href="https://github.com/jbarrow/pdfsplitter"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 font-mono text-xs font-medium text-neutral-900 hover:text-yellow-600 transition-colors whitespace-nowrap"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
              <span>View on GitHub</span>
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
