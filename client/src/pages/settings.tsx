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
import { 
  insertDatabaseSettingsSchema, 
  insertGeminiSettingsSchema,
  type InsertDatabaseSettings, 
  type DatabaseSettings,
  type GeminiSettings,
  type InsertGeminiSettings 
} from "@shared/schema";
import { z } from "zod";
import { Database, TestTube, Trash2, Settings, CheckCircle, Brain, Key } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const dbFormSchema = insertDatabaseSettingsSchema.extend({
  name: z.string().min(1, "Veritabanı adı gerekli"),
  host: z.string().min(1, "Host gerekli"),
  port: z.number().min(1, "Port gerekli").max(65535, "Geçersiz port"),
  database: z.string().min(1, "Veritabanı ismi gerekli"),
  username: z.string().min(1, "Kullanıcı adı gerekli"),
  password: z.string().min(1, "Şifre gerekli"),
});

const geminiFormSchema = insertGeminiSettingsSchema.extend({
  name: z.string().min(1, "Ayar adı gerekli"),
  apiKey: z.string().min(1, "API anahtarı gerekli"),
  selectedModel: z.string().min(1, "Model seçimi gerekli"),
});

export default function SettingsPage() {
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isTestingApiKey, setIsTestingApiKey] = useState(false);
  const [availableModels, setAvailableModels] = useState<{name: string, displayName: string}[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const dbForm = useForm<z.infer<typeof dbFormSchema>>({
    resolver: zodResolver(dbFormSchema),
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

  const geminiForm = useForm<z.infer<typeof geminiFormSchema>>({
    resolver: zodResolver(geminiFormSchema),
    defaultValues: {
      name: "",
      apiKey: "",
      selectedModel: "",
      isActive: false,
    },
  });

  const { data: databaseSettings = [] } = useQuery<DatabaseSettings[]>({
    queryKey: ["/api/database-settings"],
  });

  const { data: geminiSettings = [] } = useQuery<GeminiSettings[]>({
    queryKey: ["/api/gemini-settings"],
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
      dbForm.reset();
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
    mutationFn: async (data: z.infer<typeof dbFormSchema>) => {
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

  // Gemini API mutations
  const testApiKeyMutation = useMutation({
    mutationFn: async (apiKey: string) => {
      const response = await apiRequest("POST", "/api/gemini/test-api-key", { apiKey });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        // Model objelerinden name ve displayName'leri al
        const models = data.models.map((model: any) => ({
          name: model.name,
          displayName: model.displayName
        }));
        setAvailableModels(models);
        toast({
          title: "API Anahtarı Geçerli",
          description: `${data.models.length} model bulundu`,
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "API Anahtarı Hatası",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createGeminiSettingMutation = useMutation({
    mutationFn: async (data: InsertGeminiSettings) => {
      const response = await apiRequest("POST", "/api/gemini-settings", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Başarılı",
        description: "Gemini ayarları başarıyla eklendi",
      });
      geminiForm.reset();
      setAvailableModels([]);
      queryClient.invalidateQueries({ queryKey: ["/api/gemini-settings"] });
    },
    onError: () => {
      toast({
        title: "Hata",
        description: "Gemini ayarları eklenirken hata oluştu",
        variant: "destructive",
      });
    },
  });

  const setActiveGeminiMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("PUT", `/api/gemini-settings/${id}`, { isActive: true });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Başarılı",
        description: "Aktif Gemini ayarı değiştirildi",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/gemini-settings"] });
    },
    onError: () => {
      toast({
        title: "Hata",
        description: "Aktif Gemini ayarı değiştirilirken hata oluştu",
        variant: "destructive",
      });
    },
  });

  const onDbSubmit = (data: z.infer<typeof dbFormSchema>) => {
    createDatabaseSettingMutation.mutate(data);
  };

  const handleTestConnection = () => {
    const data = dbForm.getValues();
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

  const onGeminiSubmit = (data: z.infer<typeof geminiFormSchema>) => {
    createGeminiSettingMutation.mutate(data);
  };

  const handleTestApiKey = () => {
    const apiKey = geminiForm.getValues("apiKey");
    if (!apiKey) {
      toast({
        title: "Hata",
        description: "Lütfen API anahtarını girin",
        variant: "destructive",
      });
      return;
    }
    setIsTestingApiKey(true);
    testApiKeyMutation.mutate(apiKey, {
      onSettled: () => setIsTestingApiKey(false),
    });
  };

  const handleSetActiveGemini = (id: string) => {
    setActiveGeminiMutation.mutate(id);
  };

  return (
    <div>
      <Header 
        title="Ayarlar" 
        description="Veritabanı ve AI ayarlarını yönetin"
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
            <form onSubmit={dbForm.handleSubmit(onDbSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="name">Bağlantı Adı</Label>
                  <Input
                    id="name"
                    placeholder="Örn: Ana Veritabanı"
                    data-testid="input-db-name"
                    {...dbForm.register("name")}
                  />
                  {dbForm.formState.errors.name && (
                    <p className="text-sm text-destructive mt-1">
                      {dbForm.formState.errors.name.message}
                    </p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="host">Host</Label>
                  <Input
                    id="host"
                    placeholder="localhost veya IP adresi"
                    data-testid="input-db-host"
                    {...dbForm.register("host")}
                  />
                  {dbForm.formState.errors.host && (
                    <p className="text-sm text-destructive mt-1">
                      {dbForm.formState.errors.host.message}
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
                    {...dbForm.register("port", { valueAsNumber: true })}
                  />
                  {dbForm.formState.errors.port && (
                    <p className="text-sm text-destructive mt-1">
                      {dbForm.formState.errors.port.message}
                    </p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="database">Veritabanı Adı</Label>
                  <Input
                    id="database"
                    placeholder="Veritabanı adı"
                    data-testid="input-db-database"
                    {...dbForm.register("database")}
                  />
                  {dbForm.formState.errors.database && (
                    <p className="text-sm text-destructive mt-1">
                      {dbForm.formState.errors.database.message}
                    </p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="username">Kullanıcı Adı</Label>
                  <Input
                    id="username"
                    placeholder="MySQL kullanıcı adı"
                    data-testid="input-db-username"
                    {...dbForm.register("username")}
                  />
                  {dbForm.formState.errors.username && (
                    <p className="text-sm text-destructive mt-1">
                      {dbForm.formState.errors.username.message}
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
                    {...dbForm.register("password")}
                  />
                  {dbForm.formState.errors.password && (
                    <p className="text-sm text-destructive mt-1">
                      {dbForm.formState.errors.password.message}
                    </p>
                  )}
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch 
                  id="isActive" 
                  data-testid="switch-db-active"
                  checked={dbForm.watch("isActive") || false}
                  onCheckedChange={(checked) => dbForm.setValue("isActive", checked)}
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

        {/* Gemini AI Settings Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Brain className="mr-2 h-5 w-5" />
              Gemini AI Ayarları
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Google Gemini API ayarlarını yapılandırın
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={geminiForm.handleSubmit(onGeminiSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="gemini-name">Ayar Adı</Label>
                  <Input
                    id="gemini-name"
                    placeholder="Örn: Ana Gemini API"
                    data-testid="input-gemini-name"
                    {...geminiForm.register("name")}
                  />
                  {geminiForm.formState.errors.name && (
                    <p className="text-sm text-destructive mt-1">
                      {geminiForm.formState.errors.name.message}
                    </p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="gemini-api-key">API Anahtarı</Label>
                  <Input
                    id="gemini-api-key"
                    type="password"
                    placeholder="Gemini API anahtarınızı girin"
                    data-testid="input-gemini-api-key"
                    {...geminiForm.register("apiKey")}
                  />
                  {geminiForm.formState.errors.apiKey && (
                    <p className="text-sm text-destructive mt-1">
                      {geminiForm.formState.errors.apiKey.message}
                    </p>
                  )}
                </div>
                
                <div className="md:col-span-2">
                  <Label htmlFor="gemini-model">Model Seçimi</Label>
                  <Select
                    value={geminiForm.watch("selectedModel") || ""}
                    onValueChange={(value) => geminiForm.setValue("selectedModel", value)}
                    disabled={availableModels.length === 0}
                  >
                    <SelectTrigger data-testid="select-gemini-model">
                      <SelectValue placeholder={
                        availableModels.length === 0 
                          ? "Önce API anahtarını test edin" 
                          : "Model seçin"
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      {availableModels.map((model) => (
                        <SelectItem key={model.name} value={model.name}>
                          {model.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {geminiForm.formState.errors.selectedModel && (
                    <p className="text-sm text-destructive mt-1">
                      {geminiForm.formState.errors.selectedModel.message}
                    </p>
                  )}
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch 
                  id="gemini-active" 
                  data-testid="switch-gemini-active"
                  checked={geminiForm.watch("isActive") || false}
                  onCheckedChange={(checked) => geminiForm.setValue("isActive", checked)}
                />
                <Label htmlFor="gemini-active">Bu ayarı aktif yap</Label>
              </div>
              
              <div className="flex space-x-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleTestApiKey}
                  disabled={isTestingApiKey || testApiKeyMutation.isPending}
                  data-testid="button-test-gemini-api"
                >
                  <Key className="mr-2 h-4 w-4" />
                  {isTestingApiKey ? "Test Ediliyor..." : "API Anahtarını Test Et"}
                </Button>
                
                <Button
                  type="submit"
                  disabled={createGeminiSettingMutation.isPending || availableModels.length === 0}
                  data-testid="button-save-gemini-settings"
                >
                  <Brain className="mr-2 h-4 w-4" />
                  {createGeminiSettingMutation.isPending ? "Kaydediliyor..." : "Ayarları Kaydet"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Existing Gemini Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Mevcut Gemini AI Ayarları</CardTitle>
            <p className="text-sm text-muted-foreground">
              Kayıtlı Gemini AI ayarlarınızı yönetin
            </p>
          </CardHeader>
          <CardContent>
            {geminiSettings.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Henüz Gemini AI ayarı eklenmemiş
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ayar Adı</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead>İşlemler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {geminiSettings.map((setting) => (
                    <TableRow key={setting.id} data-testid={`gemini-setting-${setting.id}`}>
                      <TableCell>
                        <div className="font-medium">{setting.name}</div>
                        <div className="text-sm text-muted-foreground">
                          API: ****{setting.apiKey.slice(-4)}
                        </div>
                      </TableCell>
                      <TableCell>{setting.selectedModel}</TableCell>
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
                              onClick={() => handleSetActiveGemini(setting.id)}
                              disabled={setActiveGeminiMutation.isPending}
                              data-testid={`button-activate-gemini-${setting.id}`}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
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