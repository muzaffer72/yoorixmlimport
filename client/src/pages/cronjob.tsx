import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
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
import { XmlSource, Cronjob, type InsertCronjob } from "@shared/schema";
import { Clock, Play, Pause, Edit, Trash2, Plus, Download } from "lucide-react";

export default function CronjobPage() {
  const [selectedXmlSource, setSelectedXmlSource] = useState<string>("");
  const [selectedFrequency, setSelectedFrequency] = useState<string>("");
  const [cronjobName, setCronjobName] = useState<string>("");
  const [jobType, setJobType] = useState<string>("import_products");
  const [isActive, setIsActive] = useState(true);
  
  // Yeni cronjob seçenekleri
  const [updateExistingProducts, setUpdateExistingProducts] = useState(true);
  const [updateDescriptions, setUpdateDescriptions] = useState(false);
  const [useAiForDescriptions, setUseAiForDescriptions] = useState(false);
  const [updatePricesAndStock, setUpdatePricesAndStock] = useState(true);
  const [applyProfitMargin, setApplyProfitMargin] = useState(true);
  
  const [importProgress, setImportProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: xmlSources = [] } = useQuery<XmlSource[]>({
    queryKey: ["/api/xml-sources"],
  });

  const { data: cronjobs = [] } = useQuery<Cronjob[]>({
    queryKey: ["/api/cronjobs"],
  });

  const createCronjobMutation = useMutation({
    mutationFn: async (data: InsertCronjob) => {
      const response = await apiRequest("POST", "/api/cronjobs", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Başarılı",
        description: "Cronjob başarıyla oluşturuldu",
      });
      setCronjobName("");
      setSelectedXmlSource("");
      setSelectedFrequency("");
      setJobType("import_products");
      setIsActive(true);
      setUpdateExistingProducts(true);
      setUpdateDescriptions(false);
      setUseAiForDescriptions(false);
      setUpdatePricesAndStock(true);
      setApplyProfitMargin(true);
      queryClient.invalidateQueries({ queryKey: ["/api/cronjobs"] });
    },
    onError: (error: any) => {
      toast({
        title: "Hata",
        description: error.message || "Cronjob oluşturulamadı",
        variant: "destructive",
      });
    },
  });

  const deleteCronjobMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/cronjobs/${id}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Başarılı",
        description: "Cronjob silindi",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/cronjobs"] });
    },
    onError: (error: any) => {
      toast({
        title: "Hata",
        description: error.message || "Cronjob silinemedi",
        variant: "destructive",
      });
    },
  });

  const runCronjobMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/cronjobs/${id}/run`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Başarılı",
        description: "Cronjob manuel olarak çalıştırıldı",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/cronjobs"] });
    },
    onError: (error: any) => {
      toast({
        title: "Hata",
        description: error.message || "Cronjob çalıştırılamadı",
        variant: "destructive",
      });
    },
  });

  const toggleCronjobMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const response = await apiRequest("PUT", `/api/cronjobs/${id}`, { isActive });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Başarılı",
        description: "Cronjob durumu güncellendi",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/cronjobs"] });
    },
    onError: (error: any) => {
      toast({
        title: "Hata",
        description: error.message || "Cronjob durumu güncellenemedi",
        variant: "destructive",
      });
    },
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

  const handleCreateCronjob = () => {
    if (!cronjobName || !selectedXmlSource || !selectedFrequency) {
      toast({
        title: "Hata",
        description: "Lütfen tüm alanları doldurun",
        variant: "destructive",
      });
      return;
    }

    createCronjobMutation.mutate({
      name: cronjobName,
      xmlSourceId: selectedXmlSource,
      frequency: selectedFrequency,
      jobType,
      isActive,
      updateExistingProducts,
      updateDescriptions,
      useAiForDescriptions,
      updatePricesAndStock,
      applyProfitMargin
    });
  };

  const handleDeleteCronjob = (id: string) => {
    if (confirm("Bu cronjob'u silmek istediğinizden emin misiniz?")) {
      deleteCronjobMutation.mutate(id);
    }
  };

  const handleRunCronjob = (id: string) => {
    if (confirm("Bu cronjob'u manuel olarak çalıştırmak istediğinizden emin misiniz?")) {
      runCronjobMutation.mutate(id);
    }
  };

  const handleToggleCronjob = (id: string, currentStatus: boolean) => {
    toggleCronjobMutation.mutate({ id, isActive: !currentStatus });
  };

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

  const formatDate = (date: Date | string | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleString("tr-TR");
  };

  const getWebhookUrl = (cronjobId: string) => {
    return `${window.location.origin}/api/webhook/cronjob/${cronjobId}`;
  };

  return (
    <div>
      <Header 
        title="Cronjob Yönetimi" 
        description="Otomatik XML ithalat işlemlerini zamanlayın"
      >
        <Button 
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          data-testid="button-new-cronjob"
        >
          <Plus className="mr-2 h-4 w-4" />
          Yeni Cronjob
        </Button>
      </Header>
      
      <div className="p-8 space-y-8">
        {/* Cronjob Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Yeni Cronjob Oluştur</CardTitle>
            <p className="text-sm text-muted-foreground">
              XML kaynaklarından otomatik ürün ithalatı için zamanlama ayarlayın
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="cronjob-name">Cronjob Adı</Label>
              <Input
                id="cronjob-name"
                placeholder="Cronjob adı girin"
                value={cronjobName}
                onChange={(e) => setCronjobName(e.target.value)}
                data-testid="input-cronjob-name"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="xml-source">XML Kaynağı</Label>
              <Select 
                value={selectedXmlSource} 
                onValueChange={setSelectedXmlSource}
              >
                <SelectTrigger data-testid="select-xml-source">
                  <SelectValue placeholder="XML kaynağı seçin" />
                </SelectTrigger>
                <SelectContent>
                  {xmlSources.map((source) => (
                    <SelectItem key={source.id} value={source.id!}>
                      {source.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="frequency">Sıklık</Label>
              <Select 
                value={selectedFrequency}
                onValueChange={setSelectedFrequency}
              >
                <SelectTrigger data-testid="select-frequency">
                  <SelectValue placeholder="Sıklık seçin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minutely">Dakikalık</SelectItem>
                  <SelectItem value="hourly">Saatlik</SelectItem>
                  <SelectItem value="daily">Günlük</SelectItem>
                  <SelectItem value="weekly">Haftalık</SelectItem>
                  <SelectItem value="monthly">Aylık</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="jobType">İşlem Türü</Label>
              <Select value={jobType} onValueChange={setJobType}>
                <SelectTrigger>
                  <SelectValue placeholder="İşlem türünü seçin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="import_products">Ürünleri import et</SelectItem>
                  <SelectItem value="update_products">Ürünleri güncelle</SelectItem>
                  <SelectItem value="update_price_stock">Ürünün fiyatını ve stok durumunu güncelle</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Conditional options based on job type */}
            {(jobType === 'import_products' || jobType === 'update_products') && (
              <div className="grid gap-4 border rounded-lg p-4">
                <h4 className="font-medium">Ürün İşlemi Seçenekleri</h4>
                
                {jobType === 'update_products' && (
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="updateExistingProducts"
                      checked={updateExistingProducts}
                      onCheckedChange={setUpdateExistingProducts}
                    />
                    <Label htmlFor="updateExistingProducts">Mevcut ürünleri güncelle</Label>
                  </div>
                )}

                <div className="flex items-center space-x-2">
                  <Switch
                    id="updateDescriptions"
                    checked={updateDescriptions}
                    onCheckedChange={setUpdateDescriptions}
                  />
                  <Label htmlFor="updateDescriptions">Ürün açıklamalarını güncelle</Label>
                </div>

                {updateDescriptions && (
                  <div className="flex items-center space-x-2 ml-6">
                    <Switch
                      id="useAiForDescriptions"
                      checked={useAiForDescriptions}
                      onCheckedChange={setUseAiForDescriptions}
                    />
                    <Label htmlFor="useAiForDescriptions">AI ile açıklama optimizasyonu</Label>
                  </div>
                )}
              </div>
            )}

            {jobType === 'update_price_stock' && (
              <div className="grid gap-4 border rounded-lg p-4">
                <h4 className="font-medium">Fiyat ve Stok Seçenekleri</h4>
                
                <div className="flex items-center space-x-2">
                  <Switch
                    id="updatePricesAndStock"
                    checked={updatePricesAndStock}
                    onCheckedChange={setUpdatePricesAndStock}
                  />
                  <Label htmlFor="updatePricesAndStock">Fiyat ve stok güncelle</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="applyProfitMargin"
                    checked={applyProfitMargin}
                    onCheckedChange={setApplyProfitMargin}
                  />
                  <Label htmlFor="applyProfitMargin">Kar marjı uygula</Label>
                </div>
              </div>
            )}

            <div className="flex items-center space-x-2">
              <Switch 
                id="active" 
                checked={isActive}
                onCheckedChange={setIsActive}
                data-testid="switch-active"
              />
              <Label htmlFor="active">Aktif</Label>
            </div>

            <Button 
              onClick={handleCreateCronjob} 
              className="w-full"
              disabled={createCronjobMutation.isPending}
              data-testid="button-create-cronjob"
            >
              <Plus className="mr-2 h-4 w-4" />
              {createCronjobMutation.isPending ? "Oluşturuluyor..." : "Cronjob Oluştur"}
            </Button>
          </CardContent>
        </Card>

        {/* Active Cronjobs */}
        <Card>
          <CardHeader>
            <CardTitle>Aktif Cronjob'lar</CardTitle>
            <p className="text-sm text-muted-foreground">
              Zamanlanmış ithalat işlemlerinizi yönetin
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>XML Kaynağı</TableHead>
                  <TableHead>Sıklık</TableHead>
                  <TableHead>Son Çalışma</TableHead>
                  <TableHead>Sonraki Çalışma</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>İşlemler</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cronjobs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Henüz cronjob oluşturulmamış
                    </TableCell>
                  </TableRow>
                ) : (
                  cronjobs.map((cronjob) => {
                    const xmlSource = xmlSources.find(source => source.id === cronjob.xmlSourceId);
                    return (
                      <TableRow key={cronjob.id} data-testid={`cronjob-${cronjob.id}`}>
                        <TableCell>
                          <div className="font-medium">{cronjob.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {xmlSource?.name || 'Bilinmeyen XML'}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Webhook URL: 
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-auto p-0 ml-1 text-xs"
                              onClick={() => {
                                navigator.clipboard.writeText(getWebhookUrl(cronjob.id!));
                                toast({
                                  title: "Kopyalandı",
                                  description: "Webhook URL panoya kopyalandı",
                                });
                              }}
                              data-testid={`button-copy-webhook-${cronjob.id}`}
                            >
                              <Download className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {cronjob.frequency === 'minutely' && 'Dakikalık'}
                            {cronjob.frequency === 'hourly' && 'Saatlik'}
                            {cronjob.frequency === 'daily' && 'Günlük'}
                            {cronjob.frequency === 'weekly' && 'Haftalık'}
                            {cronjob.frequency === 'monthly' && 'Aylık'}
                            {cronjob.frequency === 'monthly' && 'Aylık'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDate(cronjob.lastRun)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDate(cronjob.nextRun)}
                        </TableCell>
                        <TableCell>
                          <Badge className={cronjob.isActive ? "bg-green-600 text-white" : "bg-gray-500 text-white"}>
                            {cronjob.isActive ? 'Aktif' : 'Pasif'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className={cronjob.isActive ? "text-orange-600 hover:text-orange-800" : "text-green-600 hover:text-green-800"}
                              onClick={() => handleToggleCronjob(cronjob.id!, cronjob.isActive)}
                              disabled={toggleCronjobMutation.isPending}
                              data-testid={`button-toggle-cronjob-${cronjob.id}`}
                            >
                              {cronjob.isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-green-600 hover:text-green-800"
                              onClick={() => handleRunCronjob(cronjob.id!)}
                              disabled={runCronjobMutation.isPending}
                              data-testid={`button-run-cronjob-${cronjob.id}`}
                            >
                              <Play className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:text-red-800"
                              onClick={() => handleDeleteCronjob(cronjob.id!)}
                              disabled={deleteCronjobMutation.isPending}
                              data-testid={`button-delete-cronjob-${cronjob.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Manual Import Section */}
        <Card>
          <CardHeader>
            <CardTitle>Manuel İthalat</CardTitle>
            <p className="text-sm text-muted-foreground">
              Seçili XML kaynağından anında ürün ithalatı yapın
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label>XML Kaynağı</Label>
                <Select 
                  value={selectedXmlSource} 
                  onValueChange={setSelectedXmlSource}
                  disabled={isImporting}
                >
                  <SelectTrigger data-testid="select-manual-import">
                    <SelectValue placeholder="Manuel ithalat için XML kaynağını seçin..." />
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

              {isImporting && (
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Download className="h-4 w-4 animate-spin" />
                    <span className="text-sm">İthalat işlemi devam ediyor...</span>
                  </div>
                  <Progress value={importProgress} />
                  <p className="text-xs text-muted-foreground">
                    %{Math.round(importProgress)} tamamlandı
                  </p>
                </div>
              )}

              <Button
                onClick={handleImport}
                disabled={!selectedXmlSource || isImporting}
                data-testid="button-manual-import"
              >
                <Download className="mr-2 h-4 w-4" />
                {isImporting ? "İşlem Devam Ediyor..." : "Manuel İthalatı Başlat"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
