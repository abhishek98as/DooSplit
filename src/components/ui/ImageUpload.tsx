"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import Image from "next/image";
import { ImageType, VALIDATION } from "@/lib/storage/image-types";

interface ImageUploadProps {
  images: string[]; // Array of image reference IDs
  onChange: (images: string[]) => void;
  maxImages?: number;
  type?: ImageType; // Type of images (user_profile, expense, general)
  entityId?: string; // Entity ID (user ID, expense ID, etc.)
  deferUpload?: boolean;
}

export default function ImageUpload({
  images,
  onChange,
  maxImages = 5,
  type = ImageType.GENERAL,
  entityId = 'general',
  deferUpload = false,
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({}); // For immediate base64 previews
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewCacheKey = `image-upload-previews:${type}:${entityId}`;
  const shouldDeferUpload =
    deferUpload || (type === ImageType.EXPENSE && entityId === "new-expense");

  // Hydrate previews from session cache so thumbnails survive route transitions
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(previewCacheKey);
      if (cached) {
        setLocalPreviews(JSON.parse(cached));
      }
    } catch (error) {
      console.warn('Failed to read preview cache', error);
    }
  }, [previewCacheKey]);

  const persistPreviews = (updates: Record<string, string>) => {
    setLocalPreviews((prev) => {
      const next = { ...prev, ...updates };
      try {
        sessionStorage.setItem(previewCacheKey, JSON.stringify(next));
      } catch (error) {
        console.warn('Failed to persist preview cache', error);
      }
      return next;
    });
  };

  // Helper function to get image URL from reference ID
  const getImageUrl = (imageRef: string): string => {
    // If it's already a URL (base64 or external), return as is
    if (imageRef.startsWith('http') || imageRef.startsWith('data:')) {
      return imageRef;
    }

    // Check for local base64 preview first (immediate)
    if (localPreviews[imageRef]) {
      return localPreviews[imageRef];
    }

    // For storage reference IDs, return the cached URL or a loading placeholder
    return imageUrls[imageRef] || '';
  };

  // Load image URLs when component mounts or images change
  useEffect(() => {
    const loadImageUrls = async () => {
      const newUrls: Record<string, string> = {};

      for (const imageRef of images) {
        if (
          !imageRef.startsWith("http") &&
          !imageRef.startsWith("data:") &&
          !imageRef.startsWith("temp_") &&
          !imageRef.startsWith("local_") &&
          !imageUrls[imageRef]
        ) {
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
      const newLocalPreviews: Record<string, string> = {};

      // Process all files in parallel for better UX
      const uploadPromises = Array.from(files).map(async (file) => {
        // Validate file type
        if (!file.type.startsWith("image/")) {
          alert(`${file.name} is not an image file`);
          return null;
        }

        // Validate file size (max matches backend validation)
        if (file.size > VALIDATION.MAX_FILE_SIZE) {
          alert(
            `${file.name} is too large. Maximum size is ${
              VALIDATION.MAX_FILE_SIZE / (1024 * 1024)
            }MB`
          );
          return null;
        }

        try {
          // Create immediate base64 preview for instant display
          const base64Preview = await fileToBase64(file);
          if (shouldDeferUpload) {
            // Expense creation flow uploads images after expense ID exists.
            newImages.push(base64Preview);
            return base64Preview;
          }

          const formData = new FormData();
          formData.append("file", file);
          formData.append("type", type);
          formData.append("entityId", entityId);

          try {
            const response = await fetch("/api/images/upload", {
              method: "POST",
              body: formData,
            });

            if (response.ok) {
              const data = await response.json();
              const finalImageId = String(data?.image?.id || "");
              if (finalImageId) {
                newImages.push(finalImageId);
                newLocalPreviews[finalImageId] = base64Preview;
                return finalImageId;
              }
            }
          } catch (uploadError) {
            console.warn(
              `Upload failed for ${file.name}, keeping local preview:`,
              uploadError
            );
          }

          // Fallback to local base64 image if upload fails.
          newImages.push(base64Preview);
          return base64Preview;
        } catch (error) {
          console.error(`Error processing ${file.name}:`, error);
          return null;
        }
      });

      // Wait for all processing to complete
      await Promise.allSettled(uploadPromises);

      // Filter out null values (failed validations)
      const validImages = newImages.filter(Boolean);

      // Update state with new images and previews (persisted for quick reloads)
      onChange([...images, ...validImages]);
      if (Object.keys(newLocalPreviews).length > 0) {
        persistPreviews(newLocalPreviews);
      }

    } catch (error) {
      console.error("Failed to process images:", error);
      alert("Failed to process images. Please try again.");
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

    // Delete from storage if it's a reference ID (not base64 and not temporary)
    if (
      imageRef &&
      !imageRef.startsWith("data:") &&
      !imageRef.startsWith("temp_") &&
      !imageRef.startsWith("local_")
    ) {
      try {
        const response = await fetch(`/api/images/${imageRef}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          console.error('Failed to delete image from storage');
          // Continue with local removal even if API call fails
        }
      } catch (error) {
        console.error('Error deleting image:', error);
        // Continue with local removal
      }
    }

    // Clean up local preview if it exists
    if (localPreviews[imageRef]) {
      setLocalPreviews(prev => {
        const newPreviews = { ...prev };
        delete newPreviews[imageRef];
        try {
          sessionStorage.setItem(previewCacheKey, JSON.stringify(newPreviews));
        } catch (error) {
          console.warn('Failed to update preview cache', error);
        }
        return newPreviews;
      });
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
          {images.map((image, index) => {
            const imageUrl = getImageUrl(image);
            const hasLocalPreview = localPreviews[image];
            const isLoading =
              !imageUrl &&
              !hasLocalPreview &&
              !image.startsWith("data:") &&
              !image.startsWith("http") &&
              !image.startsWith("temp_") &&
              !image.startsWith("local_");

            return (
              <div key={`${image}-${index}`} className="relative group aspect-square">
                {isLoading ? (
                  <div className="w-full h-full bg-neutral-100 dark:bg-dark-bg-secondary rounded-lg flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary"></div>
                  </div>
                ) : imageUrl || hasLocalPreview ? (
                  <Image
                    src={imageUrl || hasLocalPreview}
                    alt={`Upload ${index + 1}`}
                    fill
                    className="object-cover rounded-lg"
                    onError={(e) => {
                      // If image fails to load, show placeholder
                      const target = e.target as HTMLImageElement;
                      target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJDMTMuMSAyIDE0IDIuOSAxNCA0VjE4QzE0IDIxLjMgMTYuMyAyNCAxOSAyNEgxN0MxNy43IDI0IDE2IDIxLjMgMTYgMThWNFoiIGZpbGw9IiM5Q0E0QUYiLz4KPHBhdGggZD0iTTkgNkgxNVYxMEgxMVY2SDlaIiBmaWxsPSIjOUNBNEFGIi8+Cjwvc3ZnPgo=';
                    }}
                  />
                ) : (
                  <div className="w-full h-full bg-neutral-100 dark:bg-dark-bg-secondary rounded-lg flex items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-neutral-400" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  className="absolute top-2 right-2 p-1 bg-black/50 hover:bg-black/70 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-4 w-4 text-white" />
                </button>
                {/* Show upload status indicator */}
                {image.startsWith("temp_") && (
                  <div className="absolute bottom-2 left-2 px-2 py-1 bg-yellow-500 text-white text-xs rounded-full">
                    Uploading...
                  </div>
                )}
              </div>
            );
          })}
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
