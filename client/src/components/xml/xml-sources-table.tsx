import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { XmlSource } from "@shared/schema";
import { Edit, Play, Trash2 } from "lucide-react";

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
    </Card>
  );
}
