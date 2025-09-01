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
import { Edit, Play, Trash2, Save } from "lucide-react";

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
  const [editForm, setEditForm] = useState({ name: "", url: "" });

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

  const handleTest = (url: string) => {
    testXmlSourceMutation.mutate(url);
  };

  const updateXmlSourceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name: string; url: string } }) => {
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
    setEditForm({ name: source.name, url: source.url });
    setIsEditModalOpen(true);
  };

  const handleUpdateSubmit = () => {
    if (!editingSource) return;
    if (!editForm.name.trim() || !editForm.url.trim()) {
      toast({
        title: "Hata",
        description: "Lütfen tüm alanları doldurun",
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
          <div className="space-y-4">
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
