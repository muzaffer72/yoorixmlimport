import { useQuery, useQueryClient } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import StatsCard from "@/components/dashboard/stats-card";
import RecentActivities from "@/components/dashboard/recent-activities";
import RecentProducts from "@/components/dashboard/recent-products";
import { 
  Plus, 
  Edit, 
  TrendingUp, 
  Code
} from "lucide-react";

interface DashboardStats {
  todayAddedProducts: number;
  updatedProducts: number;
  activeXmlSources: number;
  totalOperations: number;
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
  };

  const lastUpdate = new Date().toLocaleDateString('tr-TR') + ' ' + 
    new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  if (isLoading) {
    return (
      <div>
        <Header 
          title="Anasayfa Dashboard" 
          description="XML ithalat işlemlerinizin özeti"
          lastUpdate={lastUpdate}
          onRefresh={handleRefresh}
        />
        <div className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-card border border-border rounded-lg p-6 animate-pulse">
                <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                <div className="h-8 bg-muted rounded w-1/2"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header 
        title="Anasayfa Dashboard" 
        description="XML ithalat işlemlerinizin özeti"
        lastUpdate={lastUpdate}
        onRefresh={handleRefresh}
      />
      
      <div className="p-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatsCard
            title="Bugün Eklenen Ürünler"
            value={stats?.todayAddedProducts || 0}
            icon={Plus}
            iconColor="text-green-600"
            iconBgColor="bg-green-100"
          />
          
          <StatsCard
            title="Güncellenen Ürünler"
            value={stats?.updatedProducts || 0}
            icon={Edit}
            iconColor="text-blue-600"
            iconBgColor="bg-blue-100"
          />
          
          <StatsCard
            title="Aktif XML Kaynakları"
            value={stats?.activeXmlSources || 0}
            icon={Code}
            iconColor="text-purple-600"
            iconBgColor="bg-purple-100"
          />
          
          <StatsCard
            title="Toplam İşlem"
            value={stats?.totalOperations || 0}
            icon={TrendingUp}
            iconColor="text-orange-600"
            iconBgColor="bg-orange-100"
          />
        </div>

        {/* Recent Activities and Recent Products Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <RecentActivities />
          <RecentProducts />
        </div>
      </div>
    </div>
  );
}
