// ── File System Access Strategy ───────────────────────────────────────────────
//
// Capability detection at module load time. No try/catch, no version strings.

export const HAS_FILE_SYSTEM_ACCESS =
    typeof window !== "undefined" &&
    typeof (window as any).showOpenFilePicker === "function" &&
    typeof (window as any).showSaveFilePicker === "function";

export type FileHandle = FileSystemFileHandle;

export interface OpenOptions {
    multiple?: boolean;
    types?: { description: string; accept: Record<string, string[]> }[];
}

export interface OpenedFile {
    name: string;
    text: string;
    handle: FileHandle | null;
}

export interface FileSystemStrategy {
    open(options?: OpenOptions): Promise<OpenedFile[]>;
    save(content: string, handle: FileHandle | null, suggestedName: string): Promise<FileHandle | null>;
    saveAs(content: string, suggestedName: string): Promise<FileHandle | null>;
    readonly canSaveInPlace: boolean;
}

// ── Native strategy (Chrome, Edge) ───────────────────────────────────────────

export class NativeFileSystemStrategy implements FileSystemStrategy {
    readonly canSaveInPlace = true;

    async open(options?: OpenOptions): Promise<OpenedFile[]> {
        const pickerOpts: any = { multiple: options?.multiple ?? true };
        if (options?.types) pickerOpts.types = options.types;

        const handles: FileSystemFileHandle[] = await (window as any).showOpenFilePicker(pickerOpts);
        const results: OpenedFile[] = [];
        for (const handle of handles) {
            const file = await handle.getFile();
            const text = await file.text();
            results.push({ name: file.name, text, handle });
        }
        return results;
    }

    async save(content: string, handle: FileHandle | null, suggestedName: string): Promise<FileHandle | null> {
        if (!handle) return this.saveAs(content, suggestedName);
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        return handle;
    }

    async saveAs(content: string, suggestedName: string): Promise<FileHandle | null> {
        const handle: FileSystemFileHandle = await (window as any).showSaveFilePicker({
            suggestedName,
            types: [{ description: "CSV/JSON files", accept: { "text/plain": [".csv", ".json"] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        return handle;
    }
}

// ── Download fallback strategy (Firefox, Safari) ─────────────────────────────

export class DownloadFallbackStrategy implements FileSystemStrategy {
    readonly canSaveInPlace = false;

    open(_options?: OpenOptions): Promise<OpenedFile[]> {
        return new Promise((resolve) => {
            const input = document.createElement("input");
            input.type = "file";
            input.multiple = true;
            input.accept = ".csv,.json,.graph.json,.doc.json";
            input.addEventListener("change", async () => {
                const files = Array.from(input.files ?? []);
                const results: OpenedFile[] = [];
                for (const file of files) {
                    const text = await file.text();
                    results.push({ name: file.name, text, handle: null });
                }
                resolve(results);
            });
            input.click();
        });
    }

    async save(content: string, _handle: FileHandle | null, suggestedName: string): Promise<FileHandle | null> {
        this.download(content, suggestedName);
        return null;
    }

    async saveAs(content: string, suggestedName: string): Promise<FileHandle | null> {
        this.download(content, suggestedName);
        return null;
    }

    private download(content: string, name: string): void {
        const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);
    }
}
