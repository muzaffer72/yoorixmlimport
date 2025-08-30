import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
import { XmlSource } from "@shared/schema";
import { Clock, Play, Pause, Edit, Trash2, Plus, Download } from "lucide-react";

export default function Cronjob() {
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
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label>XML Kaynağı</Label>
                <Select>
                  <SelectTrigger data-testid="select-xml-source-cronjob">
                    <SelectValue placeholder="XML kaynağını seçin..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="source1">Tedarikçi 1 XML</SelectItem>
                    <SelectItem value="source2">Tedarikçi 2 XML</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Çalışma Sıklığı</Label>
                <Select>
                  <SelectTrigger data-testid="select-frequency">
                    <SelectValue placeholder="Sıklık seçin..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">Saatlik</SelectItem>
                    <SelectItem value="daily">Günlük</SelectItem>
                    <SelectItem value="weekly">Haftalık</SelectItem>
                    <SelectItem value="custom">Özel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="md:col-span-2">
                <div className="flex items-center space-x-2">
                  <Switch id="active" data-testid="switch-cronjob-active" />
                  <Label htmlFor="active">Cronjob'u aktif et</Label>
                </div>
              </div>
            </div>
            
            <div className="mt-6">
              <Button data-testid="button-create-cronjob">
                <Clock className="mr-2 h-4 w-4" />
                Cronjob Oluştur
              </Button>
            </div>
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
                <TableRow data-testid="cronjob-example-1">
                  <TableCell>
                    <div className="font-medium">Tedarikçi 1 XML</div>
                    <div className="text-sm text-muted-foreground">supplier1.example.com</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">Günlük</Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    29.08.2025 14:00
                  </TableCell>
                  <TableCell className="text-sm">
                    30.08.2025 14:00
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-green-600 text-white">Aktif</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-blue-600 hover:text-blue-800"
                        data-testid="button-edit-cronjob-1"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-orange-600 hover:text-orange-800"
                        data-testid="button-pause-cronjob-1"
                      >
                        <Pause className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-green-600 hover:text-green-800"
                        data-testid="button-run-cronjob-1"
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-800"
                        data-testid="button-delete-cronjob-1"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                
                <TableRow data-testid="cronjob-example-2">
                  <TableCell>
                    <div className="font-medium">Tedarikçi 2 XML</div>
                    <div className="text-sm text-muted-foreground">supplier2.example.com</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">Haftalık</Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    28.08.2025 10:00
                  </TableCell>
                  <TableCell className="text-sm">
                    04.09.2025 10:00
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">Pasif</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-blue-600 hover:text-blue-800"
                        data-testid="button-edit-cronjob-2"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-green-600 hover:text-green-800"
                        data-testid="button-start-cronjob-2"
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-800"
                        data-testid="button-delete-cronjob-2"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
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
