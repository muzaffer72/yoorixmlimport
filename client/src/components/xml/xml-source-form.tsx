import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertXmlSourceSchema, type InsertXmlSource } from "@shared/schema";
import { z } from "zod";
import { FlaskConical, Download } from "lucide-react";

const formSchema = insertXmlSourceSchema.extend({
  name: z.string().min(1, "XML kaynak adı gerekli"),
  url: z.string().url("Geçerli bir URL girin"),
});

export default function XmlSourceForm() {
  const [xmlTags, setXmlTags] = useState<string[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      url: "",
      status: "active",
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
        title: "Hata",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    createXmlSourceMutation.mutate(data);
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
              {fetchStructureMutation.isPending ? "Çekiliyor..." : "XML Yapısını Çek"}
            </Button>
          </div>

          {xmlTags.length > 0 && (
            <div className="mt-6">
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
          )}
        </form>
      </CardContent>
    </Card>
  );
}
