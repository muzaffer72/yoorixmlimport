import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Save, RotateCcw } from "lucide-react";

interface XmlMappingFormProps {
  xmlTags: string[];
  onSave: (mapping: Record<string, string>) => void;
  initialMapping?: Record<string, string>;
}

const requiredFields = [
  { key: "name", label: "Ürün Adı (name)", required: true },
  { key: "category_id", label: "Kategori ID (category_id)", required: true },
  { key: "price", label: "Fiyat (price)", required: true },
  { key: "unit", label: "Birim (unit)", required: true },
  { key: "current_stock", label: "Mevcut Stok (current_stock)", required: true },
  { key: "minimum_order_quantity", label: "Minimum Sipariş Miktarı (minimum_order_quantity)", required: true },
];

const optionalFields = [
  { key: "brand_id", label: "Marka ID (brand_id)" },
  { key: "slug", label: "Slug" },
  { key: "barcode", label: "Barkod" },
  { key: "sku", label: "SKU" },
  { key: "tags", label: "Etiketler (tags)" },
  { key: "video_provider", label: "Video Sağlayıcı" },
  { key: "video_url", label: "Video URL" },
  { key: "short_description", label: "Kısa Açıklama (short_description)" },
  { key: "description", label: "Açıklama (description)" },
  { key: "external_link", label: "Harici Link" },
];

export default function XmlMappingForm({ 
  xmlTags, 
  onSave, 
  initialMapping = {} 
}: XmlMappingFormProps) {
  const [mapping, setMapping] = useState<Record<string, string>>(initialMapping);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const handleMappingChange = (field: string, value: string) => {
    setMapping(prev => ({ ...prev, [field]: value }));
  };

  const handleCustomValueChange = (field: string, value: string) => {
    setCustomValues(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    // Validate required fields
    const missingFields = requiredFields.filter(field => 
      !mapping[field.key] || (mapping[field.key] === "custom" && !customValues[field.key])
    );

    if (missingFields.length > 0) {
      toast({
        title: "Eksik Alanlar",
        description: `Şu gerekli alanlar doldurulmalı: ${missingFields.map(f => f.label).join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    // Combine mapping with custom values
    const finalMapping = { ...mapping };
    Object.keys(customValues).forEach(key => {
      if (mapping[key] === "custom") {
        finalMapping[key] = customValues[key];
      }
    });

    onSave(finalMapping);
  };

  const handleReset = () => {
    setMapping({});
    setCustomValues({});
  };

  const renderFieldSelect = (field: { key: string; label: string; required?: boolean }) => (
    <div key={field.key}>
      <Label className={field.required ? "text-destructive" : ""}>
        {field.label} {field.required && "*"}
      </Label>
      <Select
        value={mapping[field.key] || ""}
        onValueChange={(value) => handleMappingChange(field.key, value)}
      >
        <SelectTrigger data-testid={`select-${field.key}`}>
          <SelectValue placeholder="XML etiketini seçin..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">XML etiketini seçin...</SelectItem>
          {xmlTags.map((tag) => (
            <SelectItem key={tag} value={tag}>
              &lt;{tag}&gt;
            </SelectItem>
          ))}
          <SelectItem value="custom">Manuel giriş</SelectItem>
        </SelectContent>
      </Select>
      
      {mapping[field.key] === "custom" && (
        <Input
          className="mt-2"
          placeholder="Manuel değer girin..."
          value={customValues[field.key] || ""}
          onChange={(e) => handleCustomValueChange(field.key, e.target.value)}
          data-testid={`input-custom-${field.key}`}
        />
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>XML Etiket Eşleştirme</CardTitle>
        <p className="text-sm text-muted-foreground">
          XML etiketlerini veritabanı sütunlarıyla eşleştirin. Gerekli alanlar işaretlenmiştir.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Required Fields */}
          <div>
            <h4 className="text-md font-medium mb-4 text-destructive">Gerekli Alanlar</h4>
            <div className="space-y-4">
              {requiredFields.map(renderFieldSelect)}
            </div>
          </div>
          
          {/* Optional Fields */}
          <div>
            <h4 className="text-md font-medium mb-4 text-muted-foreground">İsteğe Bağlı Alanlar</h4>
            <div className="space-y-4">
              {optionalFields.map(renderFieldSelect)}
            </div>
          </div>
        </div>
        
        <div className="mt-8 flex justify-end space-x-4">
          <Button 
            type="button" 
            variant="secondary" 
            onClick={handleReset}
            data-testid="button-reset-mapping"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Sıfırla
          </Button>
          <Button 
            type="button" 
            onClick={handleSave}
            data-testid="button-save-mapping"
          >
            <Save className="mr-2 h-4 w-4" />
            Eşleştirmeyi Kaydet
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
