import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { ActivityLog } from "@shared/schema";
import { 
  Package, 
  Tag, 
  Plus, 
  RefreshCw,
  Clock
} from "lucide-react";

const getActivityIcon = (type: string) => {
  switch (type) {
    case "product_added":
      return { icon: Plus, color: "text-purple-600", bgColor: "bg-purple-100" };
    case "stock_updated":
      return { icon: Package, color: "text-blue-600", bgColor: "bg-blue-100" };
    case "price_updated":
      return { icon: Tag, color: "text-green-600", bgColor: "bg-green-100" };
    case "xml_synced":
      return { icon: RefreshCw, color: "text-orange-600", bgColor: "bg-orange-100" };
    default:
      return { icon: Clock, color: "text-gray-600", bgColor: "bg-gray-100" };
  }
};

const formatTime = (date: Date | string) => {
  const d = new Date(date);
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

export default function RecentActivities() {
  const { data: activities = [], isLoading } = useQuery<ActivityLog[]>({
    queryKey: ["/api/dashboard/activities"],
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Son İşlemler</CardTitle>
          <p className="text-sm text-muted-foreground">Yükleniyor...</p>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Son İşlemler</CardTitle>
        <p className="text-sm text-muted-foreground">Bugünün aktivitesi</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Henüz aktivite bulunmuyor
            </p>
          ) : (
            activities.map((activity) => {
              const { icon: Icon, color, bgColor } = getActivityIcon(activity.type);
              
              return (
                <div 
                  key={activity.id} 
                  className="flex items-start space-x-4"
                  data-testid={`activity-${activity.id}`}
                >
                  <div className={`${bgColor} p-2 rounded-full`}>
                    <Icon className={`${color} h-4 w-4`} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{activity.title}</p>
                    {activity.oldValue && activity.newValue && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Eski: {activity.oldValue} → Yeni: {activity.newValue}
                      </p>
                    )}
                    {activity.description && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {activity.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {formatTime(activity.createdAt || new Date())}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
        
        {activities.length > 0 && (
          <div className="mt-6">
            <Button 
              variant="ghost" 
              className="w-full text-center py-2 text-sm"
              data-testid="button-view-all-activities"
            >
              Tüm işlemleri görüntüle
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
