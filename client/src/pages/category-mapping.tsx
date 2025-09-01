import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { XmlSource, Category, CategoryMapping as CategoryMappingType } from "@shared/schema";
import { Trash2, Save, Download, RefreshCw, Wand2, CheckCircle, AlertCircle, XCircle } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export default function CategoryMapping() {
  const [selectedXmlSource, setSelectedXmlSource] = useState<string>("");
  const [xmlCategoryName, setXmlCategoryName] = useState("");
  const [localCategoryId, setLocalCategoryId] = useState("");
  const [xmlCategories, setXmlCategories] = useState<string[]>([]);
  const [extractingCategories, setExtractingCategories] = useState(false);
  const [xmlCategorySearch, setXmlCategorySearch] = useState("");
  const [localCategorySearch, setLocalCategorySearch] = useState("");
  const [showAutoMapModal, setShowAutoMapModal] = useState(false);
  const [autoMapResults, setAutoMapResults] = useState<any>(null);
  const [isAutoMapping, setIsAutoMapping] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: xmlSources = [] } = useQuery<XmlSource[]>({
    queryKey: ["/api/xml-sources"],
  });

  const { data: categories = [], isError: categoriesError, error: categoriesErrorData } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    retry: false,
    onSuccess: (data) => {
      console.log('🏷️ Categories loaded:', data.length, 'items');
      console.log('📋 Sample categories:', data.slice(0, 3));
    }
  });

  const { data: mappings = [], isLoading: mappingsLoading } = useQuery<CategoryMappingType[]>({
    queryKey: ["/api/category-mappings", selectedXmlSource],
    enabled: !!selectedXmlSource,
  });

  // Filtered XML categories based on search
  const filteredXmlCategories = useMemo(() => {
    if (!xmlCategorySearch.trim()) return xmlCategories;
    return xmlCategories.filter(category => 
      category.toLowerCase().includes(xmlCategorySearch.toLowerCase())
    );
  }, [xmlCategories, xmlCategorySearch]);

  // Filtered local categories based on search
  const filteredLocalCategories = useMemo(() => {
    if (!localCategorySearch.trim()) return categories;
    return categories.filter(category => 
      category.name.toLowerCase().includes(localCategorySearch.toLowerCase())
    );
  }, [categories, localCategorySearch]);

  const createMappingMutation = useMutation({
    mutationFn: async (data: { xmlSourceId: string; xmlCategoryName: string; localCategoryId: string }) => {
      const payload = {
        xmlSourceId: data.xmlSourceId,
        xmlCategoryName: data.xmlCategoryName,
        localCategoryId: Number(data.localCategoryId),
        confidence: "1.00", // String olarak gönder (decimal için)
        isManual: true // Manuel eşleştirme
      };
      console.log('Sending category mapping:', payload);
      const response = await apiRequest("POST", "/api/category-mappings", payload);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Başarılı",
        description: "Kategori eşleştirmesi eklendi",
      });
      setXmlCategoryName("");
      setLocalCategoryId("");
      queryClient.invalidateQueries({ queryKey: ["/api/category-mappings"] });
    },
    onError: (error: any) => {
      console.error('Category mapping error:', error);
      toast({
        title: "Hata",
        description: error.message || "Kategori eşleştirmesi eklenirken hata oluştu",
        variant: "destructive",
      });
    },
  });

  const deleteMappingMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/category-mappings/${id}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Başarılı",
        description: "Kategori eşleştirmesi silindi",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/category-mappings"] });
    },
    onError: () => {
      toast({
        title: "Hata",
        description: "Kategori eşleştirmesi silinirken hata oluştu",
        variant: "destructive",
      });
    },
  });

  const deleteAllMappingsMutation = useMutation({
    mutationFn: async (xmlSourceId: string) => {
      const response = await apiRequest("DELETE", `/api/category-mappings/source/${xmlSourceId}`);
      
      // Response content type kontrolü
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        return response.json();
      } else {
        // JSON değilse text olarak oku
        const text = await response.text();
        console.log("Non-JSON response:", text);
        return { message: "İşlem başarılı" };
      }
    },
    onSuccess: (data) => {
      toast({
        title: "Başarılı",
        description: data.message || "Tüm kategori eşleştirmeleri silindi",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/category-mappings"] });
    },
    onError: (error: Error) => {
      console.error("Delete all mappings error:", error);
      toast({
        title: "Hata",
        description: error.message || "Kategori eşleştirmeleri silinirken hata oluştu",
        variant: "destructive",
      });
    },
  });

  const handleAddMapping = () => {
    if (!selectedXmlSource || !xmlCategoryName || !localCategoryId) {
      toast({
        title: "Eksik Bilgi",
        description: "Tüm alanları doldurmanız gerekiyor",
        variant: "destructive",
      });
      return;
    }

    createMappingMutation.mutate({
      xmlSourceId: selectedXmlSource,
      xmlCategoryName,
      localCategoryId: localCategoryId, // String olarak gönder
    });
  };

  const handleDeleteMapping = (id: string) => {
    if (confirm("Bu kategori eşleştirmesini silmek istediğinizden emin misiniz?")) {
      deleteMappingMutation.mutate(id);
    }
  };

  const handleDeleteAllMappings = () => {
    if (!selectedXmlSource) {
      toast({
        title: "Hata",
        description: "Önce XML kaynağı seçin",
        variant: "destructive",
      });
      return;
    }

    if (confirm("Bu XML kaynağının tüm kategori eşleştirmelerini silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.")) {
      deleteAllMappingsMutation.mutate(selectedXmlSource);
    }
  };

  const loadStoredCategories = async () => {
    if (!selectedXmlSource) {
      toast({
        title: "Hata",
        description: "Önce XML kaynağı seçin",
        variant: "destructive",
      });
      return;
    }

    try {
      // XML source'a özel kategorileri API'den çek
      const response = await apiRequest("GET", `/api/xml-sources/${selectedXmlSource}/categories`);
      const data = await response.json();
      
      if (data.categories && data.categories.length > 0) {
        setXmlCategories(data.categories);
        toast({
          title: "Başarılı",
          description: `${data.categories.length} kategori yüklendi`,
        });
      } else {
        toast({
          title: "Uyarı", 
          description: "Bu XML kaynağında önceden çekilen kategori bulunamadı. XML eklerken kategorileri çektiğinizden emin olun.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Hata",
        description: "Kategoriler yüklenirken hata oluştu",
        variant: "destructive",
      });
    }
  };

  const handleXmlSourceChange = (value: string) => {
    setSelectedXmlSource(value);
    setXmlCategories([]);
    setXmlCategoryName("");
    setLocalCategoryId("");
    setXmlCategorySearch("");
    setLocalCategorySearch("");
    
    // Auto-load stored categories when XML source is selected
    if (value) {
      setTimeout(() => loadStoredCategories(), 100);
    }
  };

  // Auto-mapping mutation
  const autoMapMutation = useMutation({
    mutationFn: async (xmlSourceId: string) => {
      const response = await apiRequest("POST", "/api/category-mappings/ai-map", { xmlSourceId });
      return response.json();
    },
    onSuccess: (data) => {
      setAutoMapResults(data);
      setShowAutoMapModal(true);
      toast({
        title: "Otomatik Eşleştirme Tamamlandı",
        description: `${data.summary.total} kategori analiz edildi`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Hata",
        description: error.message || "Otomatik eşleştirme sırasında hata oluştu",
        variant: "destructive",
      });
    },
  });

  const handleAutoMap = () => {
    if (!selectedXmlSource) {
      toast({
        title: "Hata",
        description: "Önce XML kaynağı seçin",
        variant: "destructive",
      });
      return;
    }

    setIsAutoMapping(true);
    autoMapMutation.mutate(selectedXmlSource);
  };

  const handleApplyAutoMappings = async (mappingsToApply: any[]) => {
    try {
      for (const mapping of mappingsToApply) {
        if (mapping.suggestedCategory) {
          const response = await apiRequest("POST", "/api/category-mappings", {
            xmlSourceId: selectedXmlSource,
            xmlCategoryName: mapping.xmlCategory,
            localCategoryId: Number(mapping.suggestedCategory.id),
          });
          await response.json();
        }
      }

      queryClient.invalidateQueries({ queryKey: ["/api/category-mappings", selectedXmlSource] });
      setShowAutoMapModal(false);
      
      toast({
        title: "Başarılı",
        description: `${mappingsToApply.length} kategori eşleştirmesi uygulandı`,
      });
    } catch (error: any) {
      toast({
        title: "Hata",
        description: error.message || "Eşleştirmeler uygulanırken hata oluştu",
        variant: "destructive",
      });
    }
  };

  return (
    <div>
      <Header 
        title="Kategori Eşleştirme" 
        description="XML kategorilerini yerel kategorilerle eşleştirin"
      />
      
      <div className="p-8 space-y-8">
        {/* Category Mapping Form */}
        <Card>
          <CardHeader>
            <CardTitle>Yeni Kategori Eşleştirmesi</CardTitle>
            <p className="text-sm text-muted-foreground">
              XML'deki kategori adlarını yerel kategorilerle eşleştirin
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>XML Kaynağı</Label>
                  <Select 
                    value={selectedXmlSource} 
                    onValueChange={handleXmlSourceChange}
                  >
                    <SelectTrigger data-testid="select-xml-source">
                      <SelectValue placeholder="XML kaynağını seçin..." />
                    </SelectTrigger>
                    <SelectContent>
                      {xmlSources.map((source) => (
                        <SelectItem key={source.id} value={source.id}>
                          {source.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-end gap-2">
                  <Button 
                    onClick={loadStoredCategories}
                    disabled={!selectedXmlSource}
                    data-testid="button-load-categories"
                    variant="outline"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Kategorileri Yükle
                  </Button>
                  <Button 
                    onClick={handleAutoMap}
                    disabled={!selectedXmlSource || xmlCategories.length === 0 || autoMapMutation.isPending}
                    data-testid="button-auto-map"
                    variant="default"
                  >
                    <Wand2 className="mr-2 h-4 w-4" />
                    {autoMapMutation.isPending ? "Eşleştiriliyor..." : "Otomatik Eşleştir"}
                  </Button>
                </div>
              </div>
              
              {xmlCategories.length > 0 && (
                <div>
                  <Label>XML Kategorileri ({xmlCategories.length} adet)</Label>
                  <div className="mt-2 p-3 border rounded-md bg-muted/50 max-h-32 overflow-y-auto">
                    <div className="flex flex-wrap gap-1">
                      {xmlCategories.map((category, index) => (
                        <span
                          key={index}
                          className="inline-block px-2 py-1 text-xs bg-background border rounded cursor-pointer hover:bg-accent"
                          onClick={() => setXmlCategoryName(category)}
                          data-testid={`xml-category-${index}`}
                        >
                          {category}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              
              <Separator />
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label>XML Kategori Adı</Label>
                    {xmlCategories.length > 0 && (
                      <Input
                        placeholder="XML kategorilerinde ara..."
                        value={xmlCategorySearch}
                        onChange={(e) => setXmlCategorySearch(e.target.value)}
                        className="mb-2"
                        data-testid="input-search-xml-category"
                      />
                    )}
                    <Select 
                      value={xmlCategoryName} 
                      onValueChange={setXmlCategoryName}
                      disabled={xmlCategories.length === 0}
                    >
                      <SelectTrigger data-testid="select-xml-category">
                        <SelectValue 
                          placeholder={
                            xmlCategories.length === 0 
                              ? "Önce kategorileri yükleyin..." 
                              : "XML kategorisini seçin..."
                          } 
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredXmlCategories.length === 0 && xmlCategorySearch ? (
                          <div className="px-2 py-1 text-sm text-muted-foreground">
                            Arama sonucu bulunamadı
                          </div>
                        ) : (
                          filteredXmlCategories.map((category, index) => (
                            <SelectItem key={index} value={category}>
                              {category}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    {xmlCategories.length === 0 && selectedXmlSource && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Yukarıdaki "Kategorileri Yükle" butonunu kullanarak XML kategorilerini yükleyin
                      </p>
                    )}
                    {xmlCategories.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {filteredXmlCategories.length} / {xmlCategories.length} kategori gösteriliyor
                      </p>
                    )}
                  </div>
                  
                  <div>
                    <Label>Yerel Kategori</Label>
                    {categoriesError ? (
                      <div className="p-3 mb-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                        <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                          <XCircle className="h-4 w-4" />
                          <span className="text-sm font-medium">MySQL Bağlantı Hatası</span>
                        </div>
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                          {(categoriesErrorData as any)?.message || "Veritabanından kategoriler yüklenemedi"}
                        </p>
                        <p className="text-xs text-red-600 dark:text-red-400">
                          Lütfen Settings sayfasından MySQL ayarlarınızı kontrol edin.
                        </p>
                      </div>
                    ) : (
                      <>
                        <Input
                          placeholder="Yerel kategorilerde ara..."
                          value={localCategorySearch}
                          onChange={(e) => setLocalCategorySearch(e.target.value)}
                          className="mb-2"
                          data-testid="input-search-local-category"
                        />
                        <Select 
                          value={localCategoryId} 
                          onValueChange={setLocalCategoryId}
                          disabled={categoriesError}
                        >
                          <SelectTrigger data-testid="select-local-category">
                            <SelectValue placeholder="Yerel kategoriyi seçin..." />
                          </SelectTrigger>
                          <SelectContent>
                            {filteredLocalCategories.length === 0 && localCategorySearch ? (
                              <div className="px-2 py-1 text-sm text-muted-foreground">
                                Arama sonucu bulunamadı
                              </div>
                            ) : (
                              filteredLocalCategories.map((category) => (
                                <SelectItem key={category.id} value={String(category.id)}>
                                  {category.name || "İsimsiz Kategori"}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground mt-1">
                          {filteredLocalCategories.length} / {categories.length} kategori gösteriliyor
                        </p>
                      </>
                    )}
                  </div>
              </div>
              
              <div className="mt-6">
                <Button 
                  onClick={handleAddMapping}
                  disabled={createMappingMutation.isPending}
                  data-testid="button-add-mapping"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {createMappingMutation.isPending ? "Ekleniyor..." : "Eşleştirme Ekle"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Existing Mappings */}
        {selectedXmlSource && (
          <Card>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>Mevcut Eşleştirmeler</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Seçili XML kaynağı için kategori eşleştirmeleri
                  </p>
                </div>
                {mappings.length > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteAllMappings}
                    disabled={deleteAllMappingsMutation.isPending}
                    data-testid="button-delete-all-mappings"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {deleteAllMappingsMutation.isPending ? "Siliniyor..." : "Tümünü Sil"}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {mappingsLoading ? (
                <p className="text-sm text-muted-foreground">Yükleniyor...</p>
              ) : mappings.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Bu XML kaynağı için henüz kategori eşleştirmesi yok
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>XML Kategori Adı</TableHead>
                      <TableHead>Yerel Kategori</TableHead>
                      <TableHead>Ekleme Tarihi</TableHead>
                      <TableHead>İşlemler</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mappings.map((mapping) => {
                      // MySQL kategorilerinde ID ile eşleştirme - number ve string karşılaştırması
                      const localCategory = categories.find(c => Number(c.id) === Number(mapping.localCategoryId));
                      
                      return (
                        <TableRow key={mapping.id} data-testid={`mapping-${mapping.id}`}>
                          <TableCell className="font-medium">
                            {mapping.xmlCategoryName}
                          </TableCell>
                          <TableCell>
                            {localCategory?.name || `Kategori bulunamadı (ID: ${mapping.localCategoryId})`}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(mapping.createdAt || "").toLocaleDateString('tr-TR')}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:text-red-800"
                              onClick={() => handleDeleteMapping(mapping.id)}
                              disabled={deleteMappingMutation.isPending}
                              data-testid={`button-delete-mapping-${mapping.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Auto-mapping preview modal */}
      <Dialog open={showAutoMapModal} onOpenChange={setShowAutoMapModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Otomatik Kategori Eşleştirme Sonuçları</DialogTitle>
            <DialogDescription>
              Önerilen eşleştirmeleri gözden geçirin ve uygulamak istediğinizi seçin.
            </DialogDescription>
          </DialogHeader>
          
          {autoMapResults && (
            <div className="space-y-6">
              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium">Yüksek Güven</span>
                  </div>
                  <div className="text-2xl font-bold text-green-600">
                    {autoMapResults.summary.high}
                  </div>
                </div>
                <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                    <span className="text-sm font-medium">Orta Güven</span>
                  </div>
                  <div className="text-2xl font-bold text-yellow-600">
                    {autoMapResults.summary.medium}
                  </div>
                </div>
                <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-orange-600" />
                    <span className="text-sm font-medium">Düşük Güven</span>
                  </div>
                  <div className="text-2xl font-bold text-orange-600">
                    {autoMapResults.summary.low}
                  </div>
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-600" />
                    <span className="text-sm font-medium">Eşleşmedi</span>
                  </div>
                  <div className="text-2xl font-bold text-red-600">
                    {autoMapResults.summary.noMatch}
                  </div>
                </div>
              </div>

              {/* Mappings List */}
              <div className="space-y-4">
                <h4 className="font-medium">Önerilen Eşleştirmeler</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>XML Kategori</TableHead>
                      <TableHead>Önerilen Kategori</TableHead>
                      <TableHead>Güven Skoru</TableHead>
                      <TableHead>Durum</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {autoMapResults.mappings.map((mapping: any, index: number) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">
                          {mapping.xmlCategory}
                        </TableCell>
                        <TableCell>
                          {mapping.suggestedCategory ? mapping.suggestedCategory.name : "Eşleşme bulunamadı"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="text-sm">
                              {Math.round(mapping.confidence * 100)}%
                            </div>
                            <Badge 
                              variant={
                                mapping.confidence > 0.8 ? "default" :
                                mapping.confidence > 0.5 ? "secondary" :
                                mapping.confidence > 0.3 ? "outline" : "destructive"
                              }
                            >
                              {mapping.confidence > 0.8 ? "Yüksek" :
                               mapping.confidence > 0.5 ? "Orta" :
                               mapping.confidence > 0.3 ? "Düşük" : "Eşleşmedi"}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          {mapping.suggestedCategory && (
                            <div className="flex items-center gap-2">
                              <CheckCircle className="h-4 w-4 text-green-600" />
                              <span className="text-sm text-green-600">Uygulanabilir</span>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3">
                <Button 
                  variant="outline" 
                  onClick={() => setShowAutoMapModal(false)}
                >
                  İptal
                </Button>
                <Button 
                  onClick={() => {
                    const highConfidenceMappings = autoMapResults.mappings.filter(
                      (m: any) => m.confidence > 0.8 && m.suggestedCategory
                    );
                    handleApplyAutoMappings(highConfidenceMappings);
                  }}
                  disabled={autoMapResults.summary.high === 0}
                >
                  Yüksek Güven Eşleştirmeleri Uygula ({autoMapResults.summary.high})
                </Button>
                <Button 
                  onClick={() => {
                    const applicableMappings = autoMapResults.mappings.filter(
                      (m: any) => m.confidence > 0.5 && m.suggestedCategory
                    );
                    handleApplyAutoMappings(applicableMappings);
                  }}
                  disabled={autoMapResults.summary.high + autoMapResults.summary.medium === 0}
                >
                  Tüm Uygun Eşleştirmeleri Uygula ({autoMapResults.summary.high + autoMapResults.summary.medium})
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
