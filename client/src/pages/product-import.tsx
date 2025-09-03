import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { XmlSource } from "@shared/schema";
import { Download, AlertCircle, CheckCircle, Trash2, X, Square, Eye, Loader2 } from "lucide-react";

export default function ProductImport() {
  const [selectedXmlSource, setSelectedXmlSource] = useState<string>("");
  const [importProgress, setImportProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: xmlSources = [] } = useQuery<XmlSource[]>({
    queryKey: ["/api/xml-sources"],
  });

  // Import durumu sorgulama
  const { data: importStatus } = useQuery({
    queryKey: ["/api/products/import-status"],
    refetchInterval: 1000, // Her saniye kontrol et
    enabled: isImporting, // Sadece import devam ederken sorguyla
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

  // Preview mutation
  const previewMutation = useMutation({
    mutationFn: async (xmlSourceId: string) => {
      const response = await apiRequest("POST", `/api/xml-sources/${xmlSourceId}/preview`);
      return response.json();
    },
    onSuccess: (data) => {
      setPreviewData(data);
      setIsPreviewOpen(true);
    },
    onError: (error: any) => {
      toast({
        title: "Önizleme Hatası",
        description: error.message,
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

    // Önce önizleme göster
    previewMutation.mutate(selectedXmlSource);
  };

  const handleConfirmImport = () => {
    setIsPreviewOpen(false);
    if (confirm("İthalat işlemini başlatmak istediğinizden emin misiniz?")) {
      importProductsMutation.mutate(selectedXmlSource);
    }
  };

  const handleDeleteAllProducts = () => {
    if (window.confirm("⚠️ DİKKAT! Bu işlem veritabanındaki TÜM ürünleri silecek ve geri alınamaz!\n\nDevam etmek istediğinizden emin misiniz?")) {
      deleteAllProductsMutation.mutate();
    }
  };

  // Import iptal etme
  const cancelImportMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/products/cancel-import");
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Bilgi",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/products/import-status"] });
    },
    onError: (error: any) => {
      toast({
        title: "Hata",
        description: error.message || "İptal işlemi başarısız",
        variant: "destructive",
      });
    },
  });

  // Import durdurma (force stop)
  const stopImportMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/products/stop-import");
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Başarılı!",
        description: data.message,
      });
      setIsImporting(false);
      setImportProgress(0);
      queryClient.invalidateQueries({ queryKey: ["/api/products/import-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (error: any) => {
      toast({
        title: "Hata",
        description: error.message || "Durdurma işlemi başarısız",
        variant: "destructive",
      });
    },
  });

  const handleCancelImport = () => {
    if (window.confirm("İthalat işlemini iptal etmek istediğinizden emin misiniz?\n\nMevcut işlem tamamlanana kadar beklenecek.")) {
      cancelImportMutation.mutate();
    }
  };

  const handleStopImport = () => {
    if (window.confirm("⚠️ DİKKAT! Bu işlem ithalatı zorla durduracak!\n\nİşlem yarıda kalabilir. Devam etmek istediğinizden emin misiniz?")) {
      stopImportMutation.mutate();
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
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Download className="h-4 w-4 animate-spin" />
                      <span className="text-sm font-medium">İthalat işlemi devam ediyor...</span>
                    </div>
                    
                    {/* Import Control Buttons */}
                    <div className="flex space-x-2">
                      <Button
                        onClick={handleCancelImport}
                        disabled={cancelImportMutation.isPending}
                        variant="outline"
                        size="sm"
                        className="text-orange-600 border-orange-600 hover:bg-orange-50"
                        data-testid="button-cancel-import"
                      >
                        <X className="mr-1 h-3 w-3" />
                        {cancelImportMutation.isPending ? "İptal Ediliyor..." : "İptal Et"}
                      </Button>
                      
                      <Button
                        onClick={handleStopImport}
                        disabled={stopImportMutation.isPending}
                        variant="destructive"
                        size="sm"
                        className="bg-red-600 hover:bg-red-700"
                        data-testid="button-stop-import"
                      >
                        <Square className="mr-1 h-3 w-3" />
                        {stopImportMutation.isPending ? "Durduruluyor..." : "Zorla Durdur"}
                      </Button>
                    </div>
                  </div>
                  
                  <Progress value={importProgress} className="w-full" />
                  <p className="text-xs text-muted-foreground">
                    İlerleme: %{Math.round(importProgress)}
                  </p>
                  
                  {importStatus && (
                    <div className="text-xs text-muted-foreground">
                      <p>Import ID: {importStatus.currentImportId}</p>
                      {importStatus.shouldCancelImport && (
                        <p className="text-orange-600 font-medium">⏳ İptal işlemi devam ediyor...</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex space-x-4">
                <Button
                  onClick={handleImport}
                  disabled={!selectedXmlSource || isImporting || selectedSource?.status !== "active" || previewMutation.isPending}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                  data-testid="button-start-import"
                >
                  {previewMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Önizleme Yükleniyor...
                    </>
                  ) : isImporting ? (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      İthalat Devam Ediyor...
                    </>
                  ) : (
                    <>
                      <Eye className="mr-2 h-4 w-4" />
                      İthalat Önizlemesi
                    </>
                  )}
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

      {/* Import Preview Modal */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>İthalat Önizlemesi</DialogTitle>
          </DialogHeader>
          
          {previewData && (
            <div className="flex-1 overflow-y-auto space-y-6 pr-4" style={{ maxHeight: 'calc(90vh - 120px)' }}>
              {/* XML Source Info */}
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">XML Kaynak Bilgileri</h3>
                <div className="space-y-1 text-sm">
                  <div><strong>Kaynak:</strong> {previewData.xmlSource.name}</div>
                  <div><strong>URL:</strong> {previewData.xmlSource.url}</div>
                  <div><strong>Toplam Ürün:</strong> {previewData.totalProducts.toLocaleString()} adet</div>
                  {previewData.xmlSource.detectedPath && (
                    <div><strong>XML Path:</strong> {previewData.xmlSource.detectedPath}</div>
                  )}
                  
                  {/* Kar Oranı Bilgileri */}
                  {previewData.xmlSource.profitMargin && (
                    <div className="mt-2 pt-2 border-t border-blue-200 dark:border-blue-700">
                      <div><strong>Kar Oranı:</strong> {
                        previewData.xmlSource.profitMargin.type === 'percent' 
                          ? `%${previewData.xmlSource.profitMargin.percent} (Yüzde)` 
                          : previewData.xmlSource.profitMargin.type === 'fixed'
                          ? `${previewData.xmlSource.profitMargin.fixed} TL (Sabit)`
                          : 'Uygulanmıyor'
                      }</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Field Mapping Preview */}
              <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                <h3 className="font-semibold text-green-800 dark:text-green-200 mb-2">Field Mapping Önizlemesi</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  {Object.entries(previewData.xmlSource.fieldMapping || {}).map(([localField, xmlField]) => {
                    // XML field'dan sadece son kısmı al (path'den son nokta sonrası)
                    const displayXmlField = String(xmlField).includes('.') 
                      ? String(xmlField).split('.').pop() 
                      : String(xmlField);
                    
                    return (
                      <div key={localField} className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded border">
                        <span className="font-medium text-green-700 dark:text-green-300">{localField}:</span>
                        <span className="text-gray-600 dark:text-gray-400">{displayXmlField}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sample Product Data */}
              <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg">
                <h3 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">Örnek Ürün Verisi (İlk Ürün)</h3>
                
                {/* Mapped Data */}
                <div className="mb-4">
                  <h4 className="font-medium text-sm mb-2">Eşleştirilmiş Veriler:</h4>
                  <div className="grid grid-cols-1 gap-2 text-sm">
                    {Object.entries(previewData.mappedData || {}).map(([field, value]) => {
                      // Kar oranı uygulanmış fiyat alanları için özel stil
                      const isProfitField = field === 'finalPrice' || field === 'originalPrice';
                      const isMarginApplied = previewData.mappedData.profitMarginApplied;
                      
                      return (
                        <div 
                          key={field} 
                          className={`flex items-start justify-between p-2 rounded border ${
                            isProfitField && isMarginApplied 
                              ? 'bg-green-100 dark:bg-green-900/20 border-green-300 dark:border-green-700' 
                              : 'bg-white dark:bg-gray-800'
                          }`}
                        >
                          <span className={`font-medium capitalize ${
                            isProfitField && isMarginApplied 
                              ? 'text-green-700 dark:text-green-300' 
                              : 'text-yellow-700 dark:text-yellow-300'
                          }`}>
                            {field === 'finalPrice' ? '💰 Final Fiyat' : 
                             field === 'originalPrice' ? '💸 Orijinal Fiyat' :
                             field}:
                          </span>
                          <span className={`text-right max-w-xs truncate ${
                            isProfitField && isMarginApplied 
                              ? 'text-green-600 dark:text-green-400 font-semibold' 
                              : 'text-gray-600 dark:text-gray-400'
                          }`}>
                            {Array.isArray(value) ? 
                              `[${value.length} öğe: ${value.filter(Boolean).slice(0, 2).join(', ')}${value.length > 2 ? '...' : ''}]` : 
                              (isProfitField && isMarginApplied ? `${value} TL` : 
                               String(value).substring(0, 100) + (String(value).length > 100 ? '...' : ''))
                            }
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Raw XML Data (collapsed) */}
                <details className="mt-4">
                  <summary className="cursor-pointer font-medium text-sm text-yellow-700 dark:text-yellow-300 mb-2">
                    Ham XML Verisi (Genişletmek için tıklayın)
                  </summary>
                  <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded text-xs font-mono overflow-x-auto">
                    <pre>{JSON.stringify(previewData.rawXmlData, null, 2)}</pre>
                  </div>
                </details>
              </div>

            </div>
          )}
          
          {/* Action Buttons - Fixed at bottom */}
          {previewData && (
            <div className="flex-shrink-0 flex justify-end space-x-3 pt-4 border-t bg-white dark:bg-gray-900">
              <Button
                variant="outline"
                onClick={() => setIsPreviewOpen(false)}
                data-testid="button-cancel-preview"
              >
                İptal
              </Button>
              <Button
                onClick={handleConfirmImport}
                className="bg-green-600 hover:bg-green-700 text-white"
                data-testid="button-confirm-import"
              >
                <Download className="mr-2 h-4 w-4" />
                İthalatı Başlat
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
