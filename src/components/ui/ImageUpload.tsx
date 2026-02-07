"use client";

import { useState, useRef } from "react";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import Image from "next/image";

interface ImageUploadProps {
  images: string[];
  onChange: (images: string[]) => void;
  maxImages?: number;
}

export default function ImageUpload({ images, onChange, maxImages = 5 }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Check if adding these files would exceed the max
    if (images.length + files.length > maxImages) {
      alert(`You can only upload up to ${maxImages} images`);
      return;
    }

    setUploading(true);

    try {
      const newImages: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Validate file type
        if (!file.type.startsWith("image/")) {
          alert(`${file.name} is not an image file`);
          continue;
        }

        // Validate file size (5MB max)
        if (file.size > 5 * 1024 * 1024) {
          alert(`${file.name} is too large. Maximum size is 5MB`);
          continue;
        }

        // Convert to base64 for now (in production, upload to cloud storage)
        const base64 = await fileToBase64(file);
        newImages.push(base64);
      }

      onChange([...images, ...newImages]);
    } catch (error) {
      console.error("Failed to upload images:", error);
      alert("Failed to upload images. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const removeImage = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-neutral-700 dark:text-dark-text">
          Images (Optional)
        </label>
        <span className="text-xs text-neutral-500">
          {images.length}/{maxImages}
        </span>
      </div>

      {/* Image Preview Grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {images.map((image, index) => (
            <div key={index} className="relative group aspect-square">
              <Image
                src={image}
                alt={`Upload ${index + 1}`}
                fill
                className="object-cover rounded-lg"
              />
              <button
                type="button"
                onClick={() => removeImage(index)}
                className="absolute top-2 right-2 p-1 bg-black/50 hover:bg-black/70 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-4 w-4 text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload Button */}
      {images.length < maxImages && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            disabled={uploading}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full py-3 px-4 border-2 border-dashed border-neutral-300 dark:border-dark-border rounded-lg hover:border-primary dark:hover:border-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex flex-col items-center gap-2">
              {uploading ? (
                <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary"></div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <Upload className="h-5 w-5 text-neutral-500" />
                    <ImageIcon className="h-5 w-5 text-neutral-500" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-neutral-700 dark:text-dark-text">
                      Click to upload images
                    </p>
                    <p className="text-xs text-neutral-500 mt-1">
                      PNG, JPG, GIF up to 5MB
                    </p>
                  </div>
                </>
              )}
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
