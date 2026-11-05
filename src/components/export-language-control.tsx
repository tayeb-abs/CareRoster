"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { useLocale } from "@/components/locale-provider";
import type { AppLanguage } from "@/lib/i18n";
import type { ExportFormat } from "@/lib/office-export";
import type { PaperOrientation } from "@/lib/print-export";

export function ExportLanguageControl({ onExport }: { onExport: (language: AppLanguage, format: ExportFormat, orientation: PaperOrientation) => void | Promise<void> }) {
  const { language } = useLocale();
  const [override, setOverride] = useState<"auto" | AppLanguage>("auto");
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [orientation, setOrientation] = useState<PaperOrientation>("landscape");
  const selectedLanguage = override === "auto" ? language : override;

  return (
    <div className="export-controls">
      <label className="export-language-label">
        <span className="sr-only">{language === "ar" ? "لغة التصدير" : "Export language"}</span>
        <select
          aria-label={language === "ar" ? "لغة التصدير" : "Export language"}
          value={override}
          onChange={(event) => setOverride(event.target.value as "auto" | AppLanguage)}
        >
          <option value="auto">{language === "ar" ? "لغة الواجهة" : "Use app language"}</option>
          <option value="en">English</option>
          <option value="ar">العربية</option>
        </select>
      </label>
      <label className="export-language-label">
        <span className="sr-only">{language === "ar" ? "تنسيق التصدير" : "Export format"}</span>
        <select aria-label={language === "ar" ? "تنسيق التصدير" : "Export format"} value={format} onChange={(event) => setFormat(event.target.value as ExportFormat)}>
          <option value="pdf">{language === "ar" ? "PDF للطباعة" : "Print / PDF"}</option>
          <option value="excel">{language === "ar" ? "Excel (CSV)" : "Excel (CSV)"}</option>
          <option value="word">{language === "ar" ? "Word (DOC)" : "Word (DOC)"}</option>
          <option value="powerpoint">{language === "ar" ? "PowerPoint (PPTX)" : "PowerPoint (PPTX)"}</option>
        </select>
      </label>
      <label className="export-language-label">
        <span className="sr-only">{language === "ar" ? "اتجاه الصفحة" : "Page orientation"}</span>
        <select aria-label={language === "ar" ? "اتجاه الصفحة" : "Page orientation"} value={orientation} onChange={(event) => setOrientation(event.target.value as PaperOrientation)}>
          <option value="landscape">{language === "ar" ? "أفقي" : "Landscape"}</option>
          <option value="portrait">{language === "ar" ? "عمودي" : "Portrait"}</option>
        </select>
      </label>
      <button className="text-button" type="button" onClick={() => void onExport(selectedLanguage, format, orientation)}>
        <Download size={14} />{language === "ar" ? "تصدير" : "Export"}
      </button>
    </div>
  );
}
