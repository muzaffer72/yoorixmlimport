import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { 
  Home, 
  Code, 
  Table, 
  Upload, 
  Clock, 
  UserCircle 
} from "lucide-react";

const navigationItems = [
  {
    href: "/",
    label: "Anasayfa",
    icon: Home,
  },
  {
    href: "/xml-management",
    label: "XML Yönetimi",
    icon: Code,
  },
  {
    href: "/category-mapping",
    label: "Kategori Eşleştirme",
    icon: Table,
  },
  {
    href: "/product-import",
    label: "Ürün İthalatı",
    icon: Upload,
  },
  {
    href: "/cronjob",
    label: "Cronjob",
    icon: Clock,
  },
];

export default function Sidebar() {
  const [location] = useLocation();

  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col">
      <div className="p-6 border-b border-border">
        <h1 className="text-xl font-bold text-primary">XML Yönetim Paneli</h1>
        <p className="text-sm text-muted-foreground mt-1">E-ticaret İthalat Sistemi</p>
      </div>
      
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navigationItems.map((item) => {
            const isActive = location === item.href;
            const Icon = item.icon;
            
            return (
              <li key={item.href}>
                <a 
                  href={item.href}
                  className={cn(
                    "flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                    isActive 
                      ? "bg-primary text-primary-foreground" 
                      : "hover:bg-accent hover:text-accent-foreground"
                  )}
                  data-testid={`nav-${item.href.replace('/', '') || 'home'}`}
                >
                  <Icon className="mr-3 h-4 w-4" />
                  {item.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
      
      <div className="p-4 border-t border-border">
        <div className="flex items-center text-sm text-muted-foreground">
          <UserCircle className="mr-2 h-4 w-4" />
          <span>Admin Kullanıcı</span>
        </div>
      </div>
    </aside>
  );
}
