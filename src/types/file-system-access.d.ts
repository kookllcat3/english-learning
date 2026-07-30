interface FileSystemFileHandle {
  getFile(): Promise<File>;
}

interface OpenFilePickerOptions {
  excludeAcceptAllOption?: boolean;
  multiple?: boolean;
  types?: Array<{
    accept: Record<string, string[]>;
    description?: string;
  }>;
}

interface Window {
  showOpenFilePicker?: (options?: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>;
}
