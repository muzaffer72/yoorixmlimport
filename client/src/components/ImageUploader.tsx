import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ImageUploaderProps {
  value?: string;
  onChange: (imageData: any) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
}

export function ImageUploader({ 
  value, 
  onChange, 
  label = "Resim", 
  placeholder = "Resim seçin...",
  required = false 
}: ImageUploaderProps) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(value || null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Hata",
        description: "Lütfen geçerli bir resim dosyası seçin",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Hata",
        description: "Resim boyutu 5MB'dan küçük olmalıdır",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      // Get upload URL
      const uploadResponse = await fetch('/api/images/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Upload URL alınamadı');
      }

      const { uploadURL } = await uploadResponse.json();

      // Upload file to object storage
      const uploadFileResponse = await fetch(uploadURL, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadFileResponse.ok) {
        throw new Error('Dosya yüklenemedi');
      }

      // Process image to generate different sizes
      const processResponse = await fetch('/api/images/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageUrl: uploadURL.split('?')[0], // Remove query params
        }),
      });

      if (!processResponse.ok) {
        throw new Error('Resim işlenemedi');
      }

      const processedImages = await processResponse.json();

      // Set preview
      setPreview(URL.createObjectURL(file));

      // Return processed image data
      onChange(processedImages);

      toast({
        title: "Başarılı",
        description: "Resim başarıyla yüklendi",
      });

    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Hata",
        description: error instanceof Error ? error.message : "Resim yüklenirken hata oluştu",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = () => {
    setPreview(null);
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={`image-upload-${label}`}>
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
        {preview ? (
          <div className="relative">
            <img 
              src={preview} 
              alt="Preview" 
              className="max-w-full max-h-40 mx-auto rounded"
            />
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="absolute top-2 right-2"
              onClick={handleRemove}
              data-testid={`button-remove-${label.toLowerCase()}`}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <ImageIcon className="h-12 w-12 mx-auto text-gray-400" />
            <div>
              <Input
                id={`image-upload-${label}`}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                disabled={isUploading}
                className="hidden"
                data-testid={`input-image-${label.toLowerCase()}`}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => document.getElementById(`image-upload-${label}`)?.click()}
                disabled={isUploading}
                data-testid={`button-upload-${label.toLowerCase()}`}
              >
                <Upload className="mr-2 h-4 w-4" />
                {isUploading ? "Yükleniyor..." : placeholder}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              PNG, JPG, GIF dosyaları desteklenir. Maksimum 5MB.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}