import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { XmlSource } from "@shared/schema";
import { Edit, Play, Trash2, Save, FlaskConical, Package, Loader2 } from "lucide-react";

interface XmlSourcesTableProps {
  xmlSources: XmlSource[];
  isLoading: boolean;
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case "active":
      return <Badge className="bg-green-600 text-white">Aktif</Badge>;
    case "inactive":
      return <Badge variant="secondary">Pasif</Badge>;
    case "error":
      return <Badge variant="destructive">Hata</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
};

const formatDate = (date: Date | string | null) => {
  if (!date) return "-";
  const d = new Date(date);
  return d.toLocaleDateString('tr-TR') + " " + d.toLocaleTimeString('tr-TR', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
};

export default function XmlSourcesTable({ xmlSources, isLoading }: XmlSourcesTableProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<XmlSource | null>(null);
  const [editForm, setEditForm] = useState({ 
    name: "", 
    url: "",
    categoryTag: "",
    fieldMapping: {},
    useDefaultCategory: false,
    defaultCategoryId: null,
    profitMarginType: "none",
    profitMarginPercent: 0,
    profitMarginFixed: 0
  });

  const deleteXmlSourceMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/xml-sources/${id}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Başarılı",
        description: "XML kaynağı silindi",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/xml-sources"] });
    },
    onError: () => {
      toast({
        title: "Hata",
        description: "XML kaynağı silinirken hata oluştu",
        variant: "destructive",
      });
    },
  });

  const deleteProductsMutation = useMutation({
    mutationFn: async (xmlSourceId: string) => {
      const response = await apiRequest("DELETE", `/api/products/delete-by-xml-source/${xmlSourceId}`);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Başarılı",
        description: `${data.data.deletedProducts} ürün ve ${data.data.deletedImages} resim dosyası silindi`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/xml-sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    },
    onError: () => {
      toast({
        title: "Hata",
        description: "Ürünler silinirken hata oluştu",
        variant: "destructive",
      });
    },
  });

  const testXmlSourceMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await apiRequest("POST", "/api/xml-sources/test-connection", { url });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Test Başarılı",
        description: data.message,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Test Hatası",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDelete = (id: string) => {
    if (confirm("Bu XML kaynağını silmek istediğinizden emin misiniz?")) {
      deleteXmlSourceMutation.mutate(id);
    }
  };

  const handleDeleteProducts = (xmlSourceId: string) => {
    if (confirm("Bu XML kaynağından gelen tüm ürünleri ve resimlerini silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.")) {
      deleteProductsMutation.mutate(xmlSourceId);
    }
  };

  const handleTest = (url: string) => {
    testXmlSourceMutation.mutate(url);
  };

  const updateXmlSourceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PUT", `/api/xml-sources/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Başarılı",
        description: "XML kaynağı güncellendi",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/xml-sources"] });
      setIsEditModalOpen(false);
      setEditingSource(null);
    },
    onError: () => {
      toast({
        title: "Hata",
        description: "XML kaynağı güncellenirken hata oluştu",
        variant: "destructive",
      });
    },
  });


  const handleEdit = (source: XmlSource) => {
    setEditingSource(source);
    setEditForm({ 
      name: source.name, 
      url: source.url,
      categoryTag: source.categoryTag || "",
      fieldMapping: source.fieldMapping || {},
      useDefaultCategory: source.useDefaultCategory || false,
      defaultCategoryId: source.defaultCategoryId || null,
      profitMarginType: (source as any).profitMarginType || "none",
      profitMarginPercent: (source as any).profitMarginPercent || 0,
      profitMarginFixed: (source as any).profitMarginFixed || 0
    });
    setIsEditModalOpen(true);
  };

  const handleUpdateSubmit = () => {
    if (!editingSource) return;
    if (!editForm.name.trim() || !editForm.url.trim()) {
      toast({
        title: "Hata",
        description: "Kaynak adı ve URL gereklidir",
        variant: "destructive",
      });
      return;
    }
    
    // Field mapping JSON validation
    try {
      if (typeof editForm.fieldMapping === 'string') {
        JSON.parse(editForm.fieldMapping);
      }
    } catch {
      toast({
        title: "Hata",
        description: "Field mapping geçerli JSON formatında olmalıdır",
        variant: "destructive",
      });
      return;
    }
    
    updateXmlSourceMutation.mutate({
      id: editingSource.id,
      data: editForm
    });
  };


  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Mevcut XML Kaynakları</CardTitle>
          <p className="text-sm text-muted-foreground">Yükleniyor...</p>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mevcut XML Kaynakları</CardTitle>
        <p className="text-sm text-muted-foreground">Kayıtlı XML kaynaklarınızı yönetin</p>
      </CardHeader>
      <CardContent>
        {xmlSources.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Henüz XML kaynağı eklenmemiş
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kaynak Adı</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead>Son Güncelleme</TableHead>
                <TableHead>İşlemler</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {xmlSources.map((source) => (
                <TableRow key={source.id} data-testid={`xml-source-${source.id}`}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{source.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {source.productCount || 0} ürün eşleştirildi
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-blue-600 hover:underline cursor-pointer max-w-xs truncate">
                      {source.url}
                    </div>
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(source.status)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(source.updatedAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-blue-600 hover:text-blue-800"
                        onClick={() => handleEdit(source)}
                        data-testid={`button-edit-${source.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-green-600 hover:text-green-800"
                        onClick={() => handleTest(source.url)}
                        disabled={testXmlSourceMutation.isPending}
                        data-testid={`button-test-${source.id}`}
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-orange-600 hover:text-orange-800"
                        onClick={() => handleDeleteProducts(source.id)}
                        disabled={deleteProductsMutation.isPending}
                        data-testid={`button-delete-products-${source.id}`}
                        title="Bu XML kaynağından gelen ürünleri sil"
                      >
                        {deleteProductsMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Package className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-800"
                        onClick={() => handleDelete(source.id)}
                        disabled={deleteXmlSourceMutation.isPending}
                        data-testid={`button-delete-${source.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      
      {/* Edit Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>XML Kaynağını Düzenle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto">
            <div>
              <Label htmlFor="edit-name">Kaynak Adı</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="XML kaynağı adı"
                data-testid="input-edit-name"
              />
            </div>
            <div>
              <Label htmlFor="edit-url">URL</Label>
              <Input
                id="edit-url"
                value={editForm.url}
                onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                placeholder="XML kaynağı URL'si"
                data-testid="input-edit-url"
              />
            </div>
            
            <div>
              <Label htmlFor="edit-category-tag">Kategori Tag</Label>
              <Input
                id="edit-category-tag"
                value={editForm.categoryTag}
                onChange={(e) => setEditForm({ ...editForm, categoryTag: e.target.value })}
                placeholder="örn: kategori_son, category, product.category"
                data-testid="input-edit-category-tag"
              />
            </div>
            
            <div>
              <Label htmlFor="edit-field-mapping">Field Mapping (JSON)</Label>
              <textarea
                id="edit-field-mapping"
                className="w-full min-h-[120px] p-3 border border-gray-300 rounded-md font-mono text-sm"
                value={JSON.stringify(editForm.fieldMapping, null, 2)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    setEditForm({ ...editForm, fieldMapping: parsed });
                  } catch {
                    // Invalid JSON - keep typing
                  }
                }}
                placeholder='{"name": "adi", "price": "fiyat", "description": "aciklama"}'
                data-testid="textarea-edit-field-mapping"
              />
            </div>
            
            <div className="p-4 border rounded-lg bg-green-50/50 dark:bg-green-900/10">
              <div className="flex items-center gap-2 mb-4">
                <FlaskConical className="h-5 w-5 text-green-600" />
                <Label className="text-base font-medium text-green-700 dark:text-green-400">Kar Oranı Ayarları</Label>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Kar Oranı Türü</Label>
                  <select
                    value={editForm.profitMarginType}
                    onChange={(e) => setEditForm({ ...editForm, profitMarginType: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-md mt-2"
                    data-testid="select-edit-profit-type"
                  >
                    <option value="none">Kar Oranı Yok</option>
                    <option value="percent">Yüzde Oranı (%)</option>
                    <option value="fixed">Sabit Tutar (TL)</option>
                  </select>
                </div>
                
                <div>
                  <Label className="text-sm font-medium">
                    {editForm.profitMarginType === "percent" ? "Kar Yüzdesi" : 
                     editForm.profitMarginType === "fixed" ? "Sabit Kar Tutarı (TL)" : "Kar Değeri"}
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    max={editForm.profitMarginType === "percent" ? "500" : undefined}
                    step={editForm.profitMarginType === "fixed" ? "0.01" : "1"}
                    value={editForm.profitMarginType === "percent" ? editForm.profitMarginPercent : 
                           editForm.profitMarginType === "fixed" ? editForm.profitMarginFixed : 0}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value) || 0;
                      if (editForm.profitMarginType === "percent") {
                        setEditForm({ ...editForm, profitMarginPercent: value });
                      } else if (editForm.profitMarginType === "fixed") {
                        setEditForm({ ...editForm, profitMarginFixed: value });
                      }
                    }}
                    placeholder={editForm.profitMarginType === "percent" ? "örn: 25" : "örn: 10.50"}
                    disabled={editForm.profitMarginType === "none"}
                    className="mt-2"
                    data-testid={`input-edit-profit-${editForm.profitMarginType}`}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {editForm.profitMarginType === "percent" && "0-500% arası kar yüzdesi"}
                    {editForm.profitMarginType === "fixed" && "Sabit TL cinsinden kar tutarı"}
                    {editForm.profitMarginType === "none" && "Kar oranı uygulanmayacak"}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="border-t pt-4">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="edit-use-default-category"
                  checked={editForm.useDefaultCategory}
                  onChange={(e) => setEditForm({ ...editForm, useDefaultCategory: e.target.checked })}
                  data-testid="checkbox-edit-use-default-category"
                />
                <Label htmlFor="edit-use-default-category">Default kategori kullan (eşleştirme olmadığında)</Label>
              </div>
            </div>
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => setIsEditModalOpen(false)}
                data-testid="button-cancel-edit"
              >
                İptal
              </Button>
              <Button
                onClick={handleUpdateSubmit}
                disabled={updateXmlSourceMutation.isPending}
                data-testid="button-save-edit"
              >
                <Save className="mr-2 h-4 w-4" />
                {updateXmlSourceMutation.isPending ? "Güncelleniyor..." : "Güncelle"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
