"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileImage, X, Plus } from "lucide-react";
import Image from "next/image";

interface FloorplanUploaderProps {
  onAnalyze: (files: File[]) => void;
  isLoading: boolean;
}

interface FileWithPreview {
  file: File;
  preview: string | null;
}

export default function FloorplanUploader({
  onAnalyze,
  isLoading,
}: FloorplanUploaderProps) {
  const [files, setFiles] = useState<FileWithPreview[]>([]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = acceptedFiles.map((file) => ({
      file,
      preview: file.type !== "application/pdf" ? URL.createObjectURL(file) : null,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/webp": [".webp"],
      "application/pdf": [".pdf"],
    },
    maxSize: 20 * 1024 * 1024,
  });

  const removeFile = (index: number) => {
    setFiles((prev) => {
      const removed = prev[index];
      if (removed.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const clearAll = () => {
    files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
    setFiles([]);
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 ${
          isDragActive
            ? "border-blue-500 bg-blue-50"
            : files.length > 0
            ? "border-gray-200 hover:border-gray-300 hover:bg-gray-50 py-5"
            : "border-gray-300 hover:border-gray-400 hover:bg-gray-50 py-12"
        }`}
      >
        <input {...getInputProps()} />
        {files.length === 0 ? (
          <>
            <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-lg font-medium text-gray-700">
              Grundrisse hier ablegen
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Mehrere Dateien möglich — z.B. EG, OG, KG jeweils als eigenes Bild
              (PNG, JPG, WebP, PDF)
            </p>
          </>
        ) : (
          <div className="flex items-center justify-center gap-2 text-sm text-blue-600">
            <Plus className="w-4 h-4" />
            Weitere Grundrisse hinzufügen
          </div>
        )}
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {files.map((fp, i) => (
              <div
                key={i}
                className="relative border rounded-xl overflow-hidden bg-white shadow-sm group"
              >
                <div className="aspect-[4/3] bg-gray-100">
                  {fp.preview ? (
                    <Image
                      src={fp.preview}
                      alt={`Grundriss ${i + 1}`}
                      fill
                      className="object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400">
                      <FileImage className="w-8 h-8 mb-1" />
                      <span className="text-xs">PDF</span>
                    </div>
                  )}
                </div>
                <div className="px-2 py-1.5 text-xs text-gray-600 truncate">
                  {fp.file.name}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(i);
                  }}
                  className="absolute top-1.5 right-1.5 bg-white rounded-full p-1 shadow-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-100"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-sm text-gray-500">
              {files.length} {files.length === 1 ? "Datei" : "Dateien"} ausgewählt
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={clearAll}
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Alle entfernen
              </button>
              <button
                onClick={() => onAnalyze(files.map((f) => f.file))}
                disabled={isLoading}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Analysiere...
                  </span>
                ) : (
                  "Analyse starten"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
