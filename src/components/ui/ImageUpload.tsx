"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, X, Image as ImageIcon, Loader2 } from "lucide-react";
import Image from "next/image";
import { ImageType } from "@/lib/imagekit-service";

interface ImageUploadProps {
  images: string[]; // Array of image reference IDs
  onChange: (images: string[]) => void;
  maxImages?: number;
  type?: ImageType; // Type of images (user_profile, expense, general)
  entityId?: string; // Entity ID (user ID, expense ID, etc.)
}

export default function ImageUpload({
  images,
  onChange,
  maxImages = 5,
  type = ImageType.GENERAL,
  entityId = 'general'
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper function to get image URL from reference ID
  const getImageUrl = (imageRef: string): string => {
    // If it's already a URL (base64 or external), return as is
    if (imageRef.startsWith('http') || imageRef.startsWith('data:')) {
      return imageRef;
    }

    // For ImageKit reference IDs, we need to fetch the URL
    // For now, return a placeholder - in production, you'd cache these URLs
    return imageUrls[imageRef] || '/placeholder-image.png';
  };

  // Load image URLs when component mounts or images change
  useEffect(() => {
    const loadImageUrls = async () => {
      const newUrls: Record<string, string> = {};

      for (const imageRef of images) {
        if (!imageRef.startsWith('http') && !imageRef.startsWith('data:') && !imageUrls[imageRef]) {
          try {
            const response = await fetch(`/api/images/${imageRef}`);
            if (response.ok) {
              const data = await response.json();
              newUrls[imageRef] = data.image.url;
            }
          } catch (error) {
            console.error('Failed to load image URL:', error);
          }
        }
      }

      if (Object.keys(newUrls).length > 0) {
        setImageUrls(prev => ({ ...prev, ...newUrls }));
      }
    };

    if (images.length > 0) {
      loadImageUrls();
    }
  }, [images]);

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

        // Validate file size (10MB max to match ImageKit service)
        if (file.size > 10 * 1024 * 1024) {
          alert(`${file.name} is too large. Maximum size is 10MB`);
          continue;
        }

        // Upload to ImageKit
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', type);
        formData.append('entityId', entityId);

        const response = await fetch('/api/images/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          alert(`Failed to upload ${file.name}: ${errorData.error}`);
          continue;
        }

        const data = await response.json();
        newImages.push(data.image.id); // Store reference ID
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

  const removeImage = async (index: number) => {
    const imageRef = images[index];

    // Delete from ImageKit if it's a reference ID (not base64)
    if (imageRef && !imageRef.startsWith('data:')) {
      try {
        const response = await fetch(`/api/images/${imageRef}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          console.error('Failed to delete image from ImageKit');
          // Continue with local removal even if API call fails
        }
      } catch (error) {
        console.error('Error deleting image:', error);
        // Continue with local removal
      }
    }

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
                src={getImageUrl(image)}
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
