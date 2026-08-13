import { useEffect, useState } from "react";
import { LanguageOption, loadLanguages } from "@/utils/languageCatalog";

// Load the shared language catalog once for a page. Every speech/translation
// selector renders from the same source, so choices stay in sync.
export function useLanguageCatalog(): LanguageOption[] {
  const [languages, setLanguages] = useState<LanguageOption[]>([]);
  useEffect(() => {
    let mounted = true;
    loadLanguages().then((list) => {
      if (mounted) setLanguages(list);
    });
    return () => { mounted = false; };
  }, []);
  return languages;
}
