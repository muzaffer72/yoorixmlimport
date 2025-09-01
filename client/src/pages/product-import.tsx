import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { XmlSource } from "@shared/schema";
import { Download, AlertCircle, CheckCircle, Trash2 } from "lucide-react";

export default function ProductImport() {
  const [selectedXmlSource, setSelectedXmlSource] = useState<string>("");
  const [importProgress, setImportProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: xmlSources = [] } = useQuery<XmlSource[]>({
    queryKey: ["/api/xml-sources"],
  });

  const importProductsMutation = useMutation({
    mutationFn: async (xmlSourceId: string) => {
      setIsImporting(true);
      setImportProgress(0);
      
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setImportProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + Math.random() * 10;
        });
      }, 500);

      const response = await apiRequest("POST", "/api/products/import-from-xml", { xmlSourceId });
      
      clearInterval(progressInterval);
      setImportProgress(100);
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "İthalat Tamamlandı",
        description: data.message,
      });
      setIsImporting(false);
      setImportProgress(0);
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (error: any) => {
      toast({
        title: "İthalat Hatası",
        description: error.message,
        variant: "destructive",
      });
      setIsImporting(false);
      setImportProgress(0);
    },
  });

  const deleteAllProductsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/products/delete-all");
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Başarılı!",
        description: `${data.deletedProducts} ürün, ${data.deletedLanguages} dil verisi, ${data.deletedStocks} stok verisi silindi`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/activities"] });
    },
    onError: (error: any) => {
      toast({
        title: "Hata",
        description: error.message || "Ürün silme işlemi başarısız",
        variant: "destructive",
      });
    },
  });

  const handleImport = () => {
    if (!selectedXmlSource) {
      toast({
        title: "Hata",
        description: "Önce bir XML kaynağı seçin",
        variant: "destructive",
      });
      return;
    }

    if (confirm("Bu işlem ürünleri XML'den alarak veritabanını güncelleyecek. Devam etmek istediğinizden emin misiniz?")) {
      importProductsMutation.mutate(selectedXmlSource);
    }
  };

  const handleDeleteAllProducts = () => {
    if (window.confirm("⚠️ DİKKAT! Bu işlem veritabanındaki TÜM ürünleri silecek ve geri alınamaz!\n\nDevam etmek istediğinizden emin misiniz?")) {
      deleteAllProductsMutation.mutate();
    }
  };

  const selectedSource = xmlSources.find(source => source.id === selectedXmlSource);

  return (
    <div>
      <Header 
        title="Ürün İthalatı" 
        description="XML kaynaklarından ürünleri içe aktarın"
      />
      
      <div className="p-8 space-y-8">
        {/* Import Controls */}
        <Card>
          <CardHeader>
            <CardTitle>XML Ürün İthalatı</CardTitle>
            <p className="text-sm text-muted-foreground">
              Seçili XML kaynağından ürünleri veritabanınıza aktarın
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div>
                <Label>XML Kaynağı</Label>
                <Select 
                  value={selectedXmlSource} 
                  onValueChange={setSelectedXmlSource}
                  disabled={isImporting}
                >
                  <SelectTrigger data-testid="select-xml-source-import">
                    <SelectValue placeholder="İthalat için XML kaynağını seçin..." />
                  </SelectTrigger>
                  <SelectContent>
                    {xmlSources.map((source) => (
                      <SelectItem key={source.id} value={source.id}>
                        <div className="flex items-center justify-between w-full">
                          <span>{source.name}</span>
                          <Badge 
                            variant={source.status === "active" ? "default" : "secondary"}
                            className="ml-2"
                          >
                            {source.status}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedSource && (
                <div className="bg-muted p-4 rounded-lg">
                  <h4 className="font-medium mb-2">Seçili XML Kaynağı Bilgileri</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Kaynak Adı:</span>
                      <span className="ml-2 font-medium">{selectedSource.name}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">URL:</span>
                      <span className="ml-2 font-medium truncate">{selectedSource.url}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Durum:</span>
                      <span className="ml-2">
                        <Badge variant={selectedSource.status === "active" ? "default" : "secondary"}>
                          {selectedSource.status}
                        </Badge>
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Son Güncelleme:</span>
                      <span className="ml-2 font-medium">
                        {selectedSource.lastFetch 
                          ? new Date(selectedSource.lastFetch).toLocaleDateString('tr-TR')
                          : "Henüz güncellenmemiş"
                        }
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {isImporting && (
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Download className="h-4 w-4 animate-spin" />
                    <span className="text-sm font-medium">İthalat işlemi devam ediyor...</span>
                  </div>
                  <Progress value={importProgress} className="w-full" />
                  <p className="text-xs text-muted-foreground">
                    İlerleme: %{Math.round(importProgress)}
                  </p>
                </div>
              )}

              <div className="flex space-x-4">
                <Button
                  onClick={handleImport}
                  disabled={!selectedXmlSource || isImporting || selectedSource?.status !== "active"}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                  data-testid="button-start-import"
                >
                  <Download className="mr-2 h-4 w-4" />
                  {isImporting ? "İthalat Devam Ediyor..." : "İthalatı Başlat"}
                </Button>
                
                <Button
                  onClick={handleDeleteAllProducts}
                  disabled={deleteAllProductsMutation.isPending}
                  variant="destructive"
                  className="bg-red-600 hover:bg-red-700"
                  data-testid="button-delete-all-products"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {deleteAllProductsMutation.isPending ? "Siliniyor..." : "Tüm Ürünleri Sil"}
                </Button>
              </div>

              {selectedSource?.status !== "active" && selectedXmlSource && (
                <div className="flex items-center space-x-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span>Bu XML kaynağı aktif değil. İthalat yapmak için önce aktif hale getirin.</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Import History */}
        <Card>
          <CardHeader>
            <CardTitle>İthalat Geçmişi</CardTitle>
            <p className="text-sm text-muted-foreground">
              Son yapılan ithalat işlemleri
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center space-x-4 p-4 border border-border rounded-lg">
                <div className="bg-green-100 p-2 rounded-full">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Tedarikçi 1 XML - Başarılı İthalat</p>
                  <p className="text-xs text-muted-foreground">145 ürün işlendi, 12 güncellendi</p>
                  <p className="text-xs text-muted-foreground">29.08.2025 14:30</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-4 p-4 border border-border rounded-lg">
                <div className="bg-orange-100 p-2 rounded-full">
                  <AlertCircle className="h-4 w-4 text-orange-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Tedarikçi 2 XML - Kısmi Başarılı</p>
                  <p className="text-xs text-muted-foreground">89 ürün işlendi, 5 hata</p>
                  <p className="text-xs text-muted-foreground">29.08.2025 12:15</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
