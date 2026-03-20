export type DocumentTemplateCategory = "meetings" | "drafts" | "research" | "tasks";

export type DocumentTemplate = {
  id: string;
  name: string;
  description: string;
  category: DocumentTemplateCategory;
  placeholders: string[];
  content: string;
};

export type RenderedDocument = {
  templateId: string;
  title: string;
  category: DocumentTemplateCategory;
  markdown: string;
  html: string;
  placeholders: string[];
  values: Record<string, string>;
};

export type SavedDocumentExport = {
  format: "markdown" | "html" | "pdf";
  filePath: string;
  relativePath?: string;
};
