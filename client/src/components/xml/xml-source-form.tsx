import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertXmlSourceSchema, type InsertXmlSource, type Category } from "@shared/schema";
import { z } from "zod";
import { FlaskConical, Download, Settings, Tag, Video } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const formSchema = insertXmlSourceSchema.extend({
  name: z.string().min(1, "XML kaynak adı gerekli"),
  url: z.string().url("Geçerli bir URL girin"),
  categoryTag: z.string().optional(),
  useDefaultCategory: z.boolean().optional(),
  defaultCategoryId: z.string().optional(),
  fieldMapping: z.record(z.string()).optional(),
});

interface XmlSourceFormProps {
  onXmlTagsReceived?: (tags: string[]) => void;
}

export default function XmlSourceForm({ onXmlTagsReceived }: XmlSourceFormProps = {}) {
  const [xmlTags, setXmlTags] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [xmlCategories, setXmlCategories] = useState<string[]>([]);
  const [videoProvider, setVideoProvider] = useState<string>("none");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      url: "",
      status: "active",
      categoryTag: "",
      useDefaultCategory: false,
      defaultCategoryId: "",
      fieldMapping: {},
    },
  });

  const createXmlSourceMutation = useMutation({
    mutationFn: async (data: InsertXmlSource) => {
      const response = await apiRequest("POST", "/api/xml-sources", data);
      return response.json();
    },
    onSuccess: async (createdSource) => {
      // Eğer kategoriler çekilmişse, bu XML source için kaydet
      if (xmlCategories.length > 0 && createdSource.id) {
        try {
          await apiRequest("POST", "/api/xml-sources/extract-categories", {
            url: createdSource.url,
            categoryField: createdSource.categoryTag,
            xmlSourceId: createdSource.id
          });
        } catch (error) {
          console.log("Kategori kaydetme hatası:", error);
        }
      }
      
      toast({
        title: "Başarılı",
        description: "XML kaynağı başarıyla eklendi",
      });
      form.reset();
      setXmlTags([]);
      setXmlCategories([]);
      queryClient.invalidateQueries({ queryKey: ["/api/xml-sources"] });
    },
    onError: () => {
      toast({
        title: "Hata",
        description: "XML kaynağı eklenirken hata oluştu",
        variant: "destructive",
      });
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await apiRequest("POST", "/api/xml-sources/test-connection", { url });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Bağlantı Başarılı",
        description: data.message,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Bağlantı Hatası",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const fetchStructureMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await apiRequest("POST", "/api/xml-sources/fetch-structure", { url });
      return response.json();
    },
    onSuccess: (data) => {
      setXmlTags(data.tags);
      onXmlTagsReceived?.(data.tags); // Parent component'e gönder
      toast({
        title: "XML Yapısı Alındı",
        description: `${data.tags.length} etiket bulundu`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "XML Yükleme Hatası",
        description: error.message || "XML dosyası çok büyük veya timeout oluştu. Lütfen daha küçük bir dosya deneyin.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    const submitData = {
      ...data,
      fieldMapping: Object.keys(fieldMapping).length > 0 ? fieldMapping : undefined,
      extractedCategories: xmlCategories.length > 0 ? xmlCategories : undefined,
    };
    createXmlSourceMutation.mutate(submitData);
  };
  
  const extractCategoriesFromXml = async () => {
    const url = form.getValues("url");
    const categoryTag = form.getValues("categoryTag");
    
    if (!url || !categoryTag) {
      toast({
        title: "Hata",
        description: "XML URL'si ve kategori etiketini girin",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const response = await apiRequest("POST", "/api/xml-sources/extract-categories", {
        url,
        categoryField: categoryTag
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setXmlCategories(data.categories);
        
        // Show sample data if no categories found to help debug
        if (data.count === 0 && data.sampleData) {
          console.log("XML Sample Data:", data.sampleData);
          toast({
            title: "Uyarı",
            description: `${data.count} kategori bulundu. XML yapısını konsol loglarından kontrol edin.`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Başarılı",
            description: `${data.count} kategori bulundu`,
          });
        }
      } else {
        throw new Error(data.message);
      }
    } catch (error: any) {
      toast({
        title: "Hata",
        description: error.message || "Kategoriler çekilirken hata oluştu",
        variant: "destructive",
      });
    }
  };

  const videoProviders = [
    { key: "none", label: "Video Yok" },
    { key: "mp4", label: "MP4 Dosya" },
    { key: "youtube", label: "YouTube" },
    { key: "vimeo", label: "Vimeo" },
  ];
  
  const productFields = [
    { key: "name", label: "Ürün Adı", required: true },
    { key: "price", label: "Fiyat", required: true },
    { key: "description", label: "Açıklama", required: false },
    { key: "sku", label: "SKU/Stok Kodu", required: false },
    { key: "barcode", label: "Barkod", required: false },
    { key: "brand", label: "Marka", required: false },
    { key: "currentStock", label: "Stok Miktarı", required: true },
    { key: "unit", label: "Birim", required: false },
    { key: "thumbnail", label: "Ana Resim (Thumbnail)", required: false },
    { key: "image1", label: "Resim 1", required: false },
    { key: "video_url", label: "Video URL", required: false },
    { key: "image2", label: "Resim 2", required: false },
    { key: "image3", label: "Resim 3", required: false },
    { key: "image4", label: "Resim 4", required: false },
    { key: "image5", label: "Resim 5", required: false },
    { key: "image6", label: "Resim 6", required: false },
    { key: "image7", label: "Resim 7", required: false },
    { key: "image8", label: "Resim 8", required: false },
    { key: "image9", label: "Resim 9", required: false },
    { key: "image10", label: "Resim 10", required: false },
  ];
  
  const handleFieldMappingChange = (productField: string, xmlTag: string) => {
    setFieldMapping(prev => ({
      ...prev,
      [productField]: xmlTag === "__empty__" ? "" : xmlTag
    }));
  };

  const handleTestConnection = () => {
    const url = form.getValues("url");
    if (!url) {
      toast({
        title: "Hata",
        description: "Önce XML URL'si girin",
        variant: "destructive",
      });
      return;
    }
    testConnectionMutation.mutate(url);
  };

  const handleFetchStructure = () => {
    const url = form.getValues("url");
    if (!url) {
      toast({
        title: "Hata",
        description: "Önce XML URL'si girin",
        variant: "destructive",
      });
      return;
    }
    fetchStructureMutation.mutate(url);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>XML Kaynağı Ekleme</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="name">XML Kaynak Adı</Label>
              <Input
                id="name"
                placeholder="Örn: Tedarikçi 1 XML"
                data-testid="input-xml-name"
                {...form.register("name")}
              />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive mt-1">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>
            
            <div>
              <Label htmlFor="url">XML URL</Label>
              <Input
                id="url"
                type="url"
                placeholder="https://example.com/products.xml"
                data-testid="input-xml-url"
                {...form.register("url")}
              />
              {form.formState.errors.url && (
                <p className="text-sm text-destructive mt-1">
                  {form.formState.errors.url.message}
                </p>
              )}
            </div>
          </div>
          
          <div className="flex space-x-4">
            <Button
              type="button"
              variant="secondary"
              onClick={handleTestConnection}
              disabled={testConnectionMutation.isPending}
              data-testid="button-test-connection"
            >
              <FlaskConical className="mr-2 h-4 w-4" />
              {testConnectionMutation.isPending ? "Test Ediliyor..." : "Bağlantıyı Test Et"}
            </Button>
            
            <Button
              type="button"
              onClick={handleFetchStructure}
              disabled={fetchStructureMutation.isPending}
              data-testid="button-fetch-structure"
            >
              <Download className="mr-2 h-4 w-4" />
              {fetchStructureMutation.isPending ? "Yükleniyor... (Büyük dosyalar için 1-2 dakika sürebilir)" : "XML Yapısını Çek"}
            </Button>
          </div>

          {xmlTags.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-4">
                <Label>XML Konfigürasyonu</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  data-testid="button-toggle-advanced"
                >
                  <Settings className="mr-2 h-4 w-4" />
                  {showAdvanced ? "Basit Görünüm" : "Gelişmiş Ayarlar"}
                </Button>
              </div>
              
              <Separator className="mb-6" />
              
              {/* Category Configuration */}
              <div className="space-y-4 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="categoryTag">Kategori Etiketi</Label>
                    <Select 
                      value={form.watch("categoryTag") || ""} 
                      onValueChange={(value) => form.setValue("categoryTag", value)}
                    >
                      <SelectTrigger data-testid="select-category-tag">
                        <SelectValue placeholder="Kategori bilgisini içeren XML etiketi seçin..." />
                      </SelectTrigger>
                      <SelectContent>
                        {xmlTags.map((tag) => (
                          <SelectItem key={tag} value={tag}>
                            {tag}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={extractCategoriesFromXml}
                      disabled={!form.watch("categoryTag")}
                      data-testid="button-extract-xml-categories"
                    >
                      <Tag className="mr-2 h-4 w-4" />
                      Kategorileri Çek
                    </Button>
                  </div>
                </div>
                
                {/* Default Category Option */}
                <div className="flex items-center space-x-2">
                  <Switch
                    id="useDefaultCategory"
                    checked={form.watch("useDefaultCategory") || false}
                    onCheckedChange={(checked) => form.setValue("useDefaultCategory", checked)}
                    data-testid="switch-use-default-category"
                  />
                  <Label htmlFor="useDefaultCategory">
                    Eşleştirilmemiş kategoriler için varsayılan kategori kullan
                  </Label>
                </div>
                
                {form.watch("useDefaultCategory") && (
                  <div>
                    <Label htmlFor="defaultCategory">Varsayılan Kategori</Label>
                    <Select 
                      value={form.watch("defaultCategoryId") || ""} 
                      onValueChange={(value) => form.setValue("defaultCategoryId", value)}
                    >
                      <SelectTrigger data-testid="select-default-category">
                        <SelectValue placeholder="Varsayılan kategoriyi seçin..." />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              
              {xmlCategories.length > 0 && (
                <div className="mb-6">
                  <Label>XML'den Çekilen Kategoriler ({xmlCategories.length} adet)</Label>
                  <div className="mt-2 p-3 border rounded-md bg-muted/50 max-h-32 overflow-y-auto">
                    <div className="flex flex-wrap gap-1">
                      {xmlCategories.map((category, index) => (
                        <span
                          key={index}
                          className="inline-block px-2 py-1 text-xs bg-background border rounded"
                          data-testid={`xml-category-preview-${index}`}
                        >
                          {category}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    Bu kategoriler otomatik olarak kategori eşleştirme sayfasında görünecek
                  </p>
                </div>
              )}
              
              {showAdvanced && (
                <>
                  <Separator className="mb-6" />
                  
                  {/* Field Mapping */}
                  <div className="mb-6">
                    <Label className="text-base font-medium">Ürün Alan Eşleştirmesi</Label>
                    <p className="text-sm text-muted-foreground mb-4">
                      Ürün bilgilerini XML etiketleriyle eşleştirin
                    </p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {productFields.map((field) => (
                        <div key={field.key}>
                          <Label>
                            {field.label} {field.required && <span className="text-destructive">*</span>}
                          </Label>
                          <Select 
                            value={fieldMapping[field.key] || ""} 
                            onValueChange={(value) => handleFieldMappingChange(field.key, value)}
                          >
                            <SelectTrigger data-testid={`select-field-${field.key}`}>
                              <SelectValue placeholder={`${field.label} için XML etiketi seçin...`} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__empty__">-- Seçilmedi --</SelectItem>
                              {xmlTags.map((tag) => (
                                <SelectItem key={tag} value={tag}>
                                  {tag}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Video Configuration */}
                  <div className="mb-6 p-4 border rounded-lg bg-blue-50/50 dark:bg-blue-900/10">
                    <div className="flex items-center gap-2 mb-4">
                      <Video className="h-5 w-5 text-blue-600" />
                      <Label className="text-base font-medium text-blue-700 dark:text-blue-400">Video Ayarları</Label>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Video Provider Selection */}
                      <div>
                        <Label className="text-sm font-medium">Video Sağlayıcı</Label>
                        <RadioGroup
                          value={videoProvider}
                          onValueChange={setVideoProvider}
                          className="mt-2"
                        >
                          {videoProviders.map((provider) => (
                            <div key={provider.key} className="flex items-center space-x-2">
                              <RadioGroupItem value={provider.key} id={`provider-${provider.key}`} />
                              <Label htmlFor={`provider-${provider.key}`} className="text-sm cursor-pointer">
                                {provider.label}
                              </Label>
                            </div>
                          ))}
                        </RadioGroup>
                        <p className="text-xs text-muted-foreground mt-2">
                          Bu ayar video_provider alanına kaydedilir
                        </p>
                      </div>
                      
                      {/* Video URL Field Info */}
                      <div>
                        <Label className="text-sm font-medium">Video URL Eşleştirmesi</Label>
                        <div className="mt-2 p-3 border rounded-md bg-background/50">
                          <p className="text-sm text-muted-foreground">
                            Video URL için XML etiket eşleştirmesi yukarıdaki 
                            <strong> "Video URL"</strong> alanından yapılır.
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            İsteğe bağlı - boş bırakılabilir
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Available XML Tags */}
                  <div>
                    <Label>Bulunan XML Etiketleri ({xmlTags.length})</Label>
                    <div className="mt-2 p-4 bg-muted rounded-lg max-h-40 overflow-y-auto">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {xmlTags.map((tag) => (
                          <code key={tag} className="text-xs bg-background px-2 py-1 rounded">
                            {tag}
                          </code>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          
          <div className="flex space-x-4">
            <Button
              type="submit"
              disabled={createXmlSourceMutation.isPending}
              data-testid="button-create-xml-source"
            >
              {createXmlSourceMutation.isPending ? "Kaydediliyor..." : "XML Kaynağını Kaydet"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
