import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { insertDatabaseSettingsSchema, type InsertDatabaseSettings, type DatabaseSettings } from "@shared/schema";
import { z } from "zod";
import { Database, TestTube, Trash2, Settings, CheckCircle } from "lucide-react";

const formSchema = insertDatabaseSettingsSchema.extend({
  name: z.string().min(1, "Veritabanı adı gerekli"),
  host: z.string().min(1, "Host gerekli"),
  port: z.number().min(1, "Port gerekli").max(65535, "Geçersiz port"),
  database: z.string().min(1, "Veritabanı ismi gerekli"),
  username: z.string().min(1, "Kullanıcı adı gerekli"),
  password: z.string().min(1, "Şifre gerekli"),
});

export default function SettingsPage() {
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      host: "",
      port: 3306,
      database: "",
      username: "",
      password: "",
      isActive: false,
    },
  });

  const { data: databaseSettings = [] } = useQuery<DatabaseSettings[]>({
    queryKey: ["/api/database-settings"],
  });

  const createDatabaseSettingMutation = useMutation({
    mutationFn: async (data: InsertDatabaseSettings) => {
      const response = await apiRequest("POST", "/api/database-settings", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Başarılı",
        description: "Veritabanı ayarları başarıyla eklendi",
      });
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/database-settings"] });
    },
    onError: () => {
      toast({
        title: "Hata",
        description: "Veritabanı ayarları eklenirken hata oluştu",
        variant: "destructive",
      });
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      const response = await apiRequest("POST", "/api/database-settings/test-connection", data);
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

  const deleteDatabaseSettingMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/database-settings/${id}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Başarılı",
        description: "Veritabanı ayarı silindi",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/database-settings"] });
    },
    onError: () => {
      toast({
        title: "Hata",
        description: "Veritabanı ayarı silinirken hata oluştu",
        variant: "destructive",
      });
    },
  });

  const setActiveDatabaseMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("PUT", `/api/database-settings/${id}/activate`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Başarılı",
        description: "Aktif veritabanı değiştirildi",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/database-settings"] });
    },
    onError: () => {
      toast({
        title: "Hata",
        description: "Aktif veritabanı değiştirilirken hata oluştu",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    createDatabaseSettingMutation.mutate(data);
  };

  const handleTestConnection = () => {
    const data = form.getValues();
    if (!data.host || !data.database || !data.username) {
      toast({
        title: "Hata",
        description: "Lütfen tüm gerekli alanları doldurun",
        variant: "destructive",
      });
      return;
    }
    setIsTestingConnection(true);
    testConnectionMutation.mutate(data, {
      onSettled: () => setIsTestingConnection(false),
    });
  };

  const handleDelete = (id: string) => {
    if (confirm("Bu veritabanı ayarını silmek istediğinizden emin misiniz?")) {
      deleteDatabaseSettingMutation.mutate(id);
    }
  };

  const handleSetActive = (id: string) => {
    setActiveDatabaseMutation.mutate(id);
  };

  return (
    <div>
      <Header 
        title="Ayarlar" 
        description="Veritabanı bağlantı ayarlarını yönetin"
      />
      
      <div className="p-8 space-y-8">
        {/* Database Connection Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Database className="mr-2 h-5 w-5" />
              Yeni Veritabanı Bağlantısı
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              MySQL veritabanı bağlantı bilgilerini girin
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="name">Bağlantı Adı</Label>
                  <Input
                    id="name"
                    placeholder="Örn: Ana Veritabanı"
                    data-testid="input-db-name"
                    {...form.register("name")}
                  />
                  {form.formState.errors.name && (
                    <p className="text-sm text-destructive mt-1">
                      {form.formState.errors.name.message}
                    </p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="host">Host</Label>
                  <Input
                    id="host"
                    placeholder="localhost veya IP adresi"
                    data-testid="input-db-host"
                    {...form.register("host")}
                  />
                  {form.formState.errors.host && (
                    <p className="text-sm text-destructive mt-1">
                      {form.formState.errors.host.message}
                    </p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="port">Port</Label>
                  <Input
                    id="port"
                    type="number"
                    placeholder="3306"
                    data-testid="input-db-port"
                    {...form.register("port", { valueAsNumber: true })}
                  />
                  {form.formState.errors.port && (
                    <p className="text-sm text-destructive mt-1">
                      {form.formState.errors.port.message}
                    </p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="database">Veritabanı Adı</Label>
                  <Input
                    id="database"
                    placeholder="Veritabanı adı"
                    data-testid="input-db-database"
                    {...form.register("database")}
                  />
                  {form.formState.errors.database && (
                    <p className="text-sm text-destructive mt-1">
                      {form.formState.errors.database.message}
                    </p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="username">Kullanıcı Adı</Label>
                  <Input
                    id="username"
                    placeholder="MySQL kullanıcı adı"
                    data-testid="input-db-username"
                    {...form.register("username")}
                  />
                  {form.formState.errors.username && (
                    <p className="text-sm text-destructive mt-1">
                      {form.formState.errors.username.message}
                    </p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="password">Şifre</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="MySQL şifresi"
                    data-testid="input-db-password"
                    {...form.register("password")}
                  />
                  {form.formState.errors.password && (
                    <p className="text-sm text-destructive mt-1">
                      {form.formState.errors.password.message}
                    </p>
                  )}
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch 
                  id="isActive" 
                  data-testid="switch-db-active"
                  checked={form.watch("isActive") || false}
                  onCheckedChange={(checked) => form.setValue("isActive", checked)}
                />
                <Label htmlFor="isActive">Bu bağlantıyı aktif yap</Label>
              </div>
              
              <div className="flex space-x-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleTestConnection}
                  disabled={isTestingConnection || testConnectionMutation.isPending}
                  data-testid="button-test-db-connection"
                >
                  <TestTube className="mr-2 h-4 w-4" />
                  {isTestingConnection ? "Test Ediliyor..." : "Bağlantıyı Test Et"}
                </Button>
                
                <Button
                  type="submit"
                  disabled={createDatabaseSettingMutation.isPending}
                  data-testid="button-save-db-settings"
                >
                  <Settings className="mr-2 h-4 w-4" />
                  {createDatabaseSettingMutation.isPending ? "Kaydediliyor..." : "Ayarları Kaydet"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Existing Database Connections */}
        <Card>
          <CardHeader>
            <CardTitle>Mevcut Veritabanı Bağlantıları</CardTitle>
            <p className="text-sm text-muted-foreground">
              Kayıtlı veritabanı bağlantılarınızı yönetin
            </p>
          </CardHeader>
          <CardContent>
            {databaseSettings.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Henüz veritabanı bağlantısı eklenmemiş
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bağlantı Adı</TableHead>
                    <TableHead>Host</TableHead>
                    <TableHead>Veritabanı</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead>İşlemler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {databaseSettings.map((setting) => (
                    <TableRow key={setting.id} data-testid={`db-setting-${setting.id}`}>
                      <TableCell>
                        <div className="font-medium">{setting.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {setting.username}@{setting.host}:{setting.port}
                        </div>
                      </TableCell>
                      <TableCell>{setting.host}</TableCell>
                      <TableCell>{setting.database}</TableCell>
                      <TableCell>
                        {setting.isActive ? (
                          <Badge className="bg-green-600 text-white">
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Aktif
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Pasif</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          {!setting.isActive && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-green-600 hover:text-green-800"
                              onClick={() => handleSetActive(setting.id)}
                              disabled={setActiveDatabaseMutation.isPending}
                              data-testid={`button-activate-${setting.id}`}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-800"
                            onClick={() => handleDelete(setting.id)}
                            disabled={deleteDatabaseSettingMutation.isPending}
                            data-testid={`button-delete-${setting.id}`}
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
      </div>
    </div>
  );
}