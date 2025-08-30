import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { Product } from "@shared/schema";
import { Image } from "lucide-react";

const formatPrice = (price: string) => {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
  }).format(parseFloat(price));
};

const formatTime = (date: Date | string) => {
  const d = new Date(date);
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

const getStatusBadge = (product: Product) => {
  if (!product.isApproved) {
    return <Badge variant="secondary">Beklemede</Badge>;
  }
  if (product.currentStock <= 0) {
    return <Badge variant="destructive">Stok Yok</Badge>;
  }
  return <Badge className="bg-green-600 text-white">Aktif</Badge>;
};

export default function RecentProducts() {
  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/dashboard/recent-products"],
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Son Eklenen Ürünler</CardTitle>
          <p className="text-sm text-muted-foreground">Yükleniyor...</p>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Son Eklenen Ürünler</CardTitle>
        <p className="text-sm text-muted-foreground">Bugün eklenen ürünler</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Bugün henüz ürün eklenmemiş
            </p>
          ) : (
            products.map((product) => (
              <div 
                key={product.id} 
                className="flex items-center space-x-4"
                data-testid={`product-${product.id}`}
              >
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <Image className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{product.name}</p>
                  {product.sku && (
                    <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>
                  )}
                  <div className="flex items-center mt-1">
                    {getStatusBadge(product)}
                    <span className="text-xs text-muted-foreground ml-2">
                      {product.currentStock} stok
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">
                    {formatPrice(product.price)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatTime(product.createdAt || new Date())}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
        
        {products.length > 0 && (
          <div className="mt-6">
            <Button 
              variant="ghost" 
              className="w-full text-center py-2 text-sm"
              data-testid="button-view-all-products"
            >
              Tüm ürünleri görüntüle
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
