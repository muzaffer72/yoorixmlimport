export interface XmlTag {
  name: string;
  path: string;
}

export interface XmlMapping {
  [key: string]: string;
}

export interface ImportProgress {
  processed: number;
  total: number;
  status: 'running' | 'completed' | 'error';
  errors: string[];
}
