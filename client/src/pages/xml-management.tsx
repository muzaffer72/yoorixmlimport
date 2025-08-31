import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import Header from "@/components/layout/header";
import XmlSourceForm from "@/components/xml/xml-source-form";
import XmlMappingForm from "@/components/xml/xml-mapping-form";
import XmlSourcesTable from "@/components/xml/xml-sources-table";
import { XmlSource } from "@shared/schema";
import { Plus } from "lucide-react";
import { useState } from "react";

export default function XmlManagement() {
  const [xmlTags, setXmlTags] = useState<string[]>([]);
  
  const { data: xmlSources = [], isLoading } = useQuery<XmlSource[]>({
    queryKey: ["/api/xml-sources"],
  });

  const handleSaveMapping = (mapping: Record<string, string>) => {
    console.log("Mapping saved:", mapping);
    // This would typically update the selected XML source with the mapping
  };

  return (
    <div>
      <Header 
        title="XML Yönetimi" 
        description="XML kaynaklarını yönetin ve eşleştirin"
      >
        <Button 
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          data-testid="button-new-xml"
        >
          <Plus className="mr-2 h-4 w-4" />
          Yeni XML Ekle
        </Button>
      </Header>
      
      <div className="p-8 space-y-8">
        {/* XML Source Form */}
        <XmlSourceForm onXmlTagsReceived={setXmlTags} />

        {/* Existing XML Sources */}
        <XmlSourcesTable 
          xmlSources={xmlSources}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
