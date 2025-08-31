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
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { XmlSource, Category, CategoryMapping as CategoryMappingType } from "@shared/schema";
import { Trash2, Save, Download, RefreshCw } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export default function CategoryMapping() {
  const [selectedXmlSource, setSelectedXmlSource] = useState<string>("");
  const [xmlCategoryName, setXmlCategoryName] = useState("");
  const [localCategoryId, setLocalCategoryId] = useState("");
  const [xmlCategories, setXmlCategories] = useState<string[]>([]);
  const [extractingCategories, setExtractingCategories] = useState(false);
  const [xmlCategorySearch, setXmlCategorySearch] = useState("");
  const [localCategorySearch, setLocalCategorySearch] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: xmlSources = [] } = useQuery<XmlSource[]>({
    queryKey: ["/api/xml-sources"],
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
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
      const response = await apiRequest("POST", "/api/category-mappings", data);
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
    onError: () => {
      toast({
        title: "Hata",
        description: "Kategori eşleştirmesi eklenirken hata oluştu",
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
      localCategoryId,
    });
  };

  const handleDeleteMapping = (id: string) => {
    if (confirm("Bu kategori eşleştirmesini silmek istediğinizden emin misiniz?")) {
      deleteMappingMutation.mutate(id);
    }
  };

  const loadStoredCategories = () => {
    if (!selectedXmlSource) {
      toast({
        title: "Hata",
        description: "Önce XML kaynağı seçin",
        variant: "destructive",
      });
      return;
    }

    const xmlSource = xmlSources.find(source => source.id === selectedXmlSource);
    if (!xmlSource) {
      toast({
        title: "Hata",
        description: "XML kaynağı bulunamadı",
        variant: "destructive",
      });
      return;
    }

    // Use stored categories if available
    if (xmlSource.extractedCategories && Array.isArray(xmlSource.extractedCategories)) {
      setXmlCategories(xmlSource.extractedCategories);
      toast({
        title: "Başarılı",
        description: `${xmlSource.extractedCategories.length} kategori yüklendi`,
      });
    } else {
      toast({
        title: "Uyarı",
        description: "Bu XML kaynağında önceden çekilen kategori bulunamadı. XML eklerken kategorileri çektiğinizden emin olun.",
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
                
                <div className="flex items-end">
                  <Button 
                    onClick={loadStoredCategories}
                    disabled={!selectedXmlSource}
                    data-testid="button-load-categories"
                    variant="outline"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Kategorileri Yükle
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
                            <SelectItem key={category.id} value={category.id}>
                              {category.name || "İsimsiz Kategori"}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      {filteredLocalCategories.length} / {categories.length} kategori gösteriliyor
                    </p>
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
              <CardTitle>Mevcut Eşleştirmeler</CardTitle>
              <p className="text-sm text-muted-foreground">
                Seçili XML kaynağı için kategori eşleştirmeleri
              </p>
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
                      const localCategory = categories.find(c => c.id === mapping.localCategoryId);
                      
                      return (
                        <TableRow key={mapping.id} data-testid={`mapping-${mapping.id}`}>
                          <TableCell className="font-medium">
                            {mapping.xmlCategoryName}
                          </TableCell>
                          <TableCell>
                            {localCategory?.name || "Kategori bulunamadı"}
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
    </div>
  );
}
