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
import { FlaskConical, Download, Settings, Tag } from "lucide-react";

const formSchema = insertXmlSourceSchema.extend({
  name: z.string().min(1, "XML kaynak adı gerekli"),
  url: z.string().url("Geçerli bir URL girin"),
  categoryTag: z.string().optional(),
  useDefaultCategory: z.boolean().optional(),
  defaultCategoryId: z.string().optional(),
  fieldMapping: z.record(z.string()).optional(),
});

export default function XmlSourceForm() {
  const [xmlTags, setXmlTags] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [xmlCategories, setXmlCategories] = useState<string[]>([]);
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
    onSuccess: () => {
      toast({
        title: "Başarılı",
        description: "XML kaynağı başarıyla eklendi",
      });
      form.reset();
      setXmlTags([]);
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
        toast({
          title: "Başarılı",
          description: `${data.count} kategori bulundu`,
        });
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
  
  const productFields = [
    { key: "name", label: "Ürün Adı", required: true },
    { key: "price", label: "Fiyat", required: true },
    { key: "description", label: "Açıklama", required: false },
    { key: "sku", label: "SKU/Stok Kodu", required: false },
    { key: "barcode", label: "Barkod", required: false },
    { key: "brand", label: "Marka", required: false },
    { key: "currentStock", label: "Stok Miktarı", required: true },
    { key: "unit", label: "Birim", required: true },
  ];
  
  const handleFieldMappingChange = (productField: string, xmlTag: string) => {
    setFieldMapping(prev => ({
      ...prev,
      [productField]: xmlTag
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
                              <SelectItem value="">-- Seçilmedi --</SelectItem>
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
