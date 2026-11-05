"use client";

import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { translateText, type AppLanguage } from "@/lib/i18n";

type LocaleContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  toggleLanguage: () => void;
};

const LocaleContext = createContext<LocaleContextValue>({
  language: "en",
  setLanguage: () => undefined,
  toggleLanguage: () => undefined,
});

const listeners = new Set<() => void>();

function subscribeToLanguage(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getLanguageSnapshot(): AppLanguage {
  if (typeof window === "undefined") return "en";
  return window.localStorage.getItem("careroster-language") === "ar" ? "ar" : "en";
}

function notifyLanguageChange() {
  listeners.forEach((listener) => listener());
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const language = useSyncExternalStore(subscribeToLanguage, getLanguageSnapshot, (): AppLanguage => "en");

  const setLanguage = useCallback((next: AppLanguage) => {
    window.localStorage.setItem("careroster-language", next);
    notifyLanguageChange();
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage(language === "en" ? "ar" : "en");
  }, [language, setLanguage]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, [language]);

  return (
    <LocaleContext.Provider value={{ language, setLanguage, toggleLanguage }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}

function localizeNode(node: ReactNode, language: AppLanguage): ReactNode {
  if (typeof node === "string") return translateText(node, language);
  if (Array.isArray(node)) return Children.map(node, (child) => localizeNode(child, language));
  if (!isValidElement<{ children?: ReactNode; placeholder?: string; title?: string; "aria-label"?: string }>(node)) {
    return node;
  }
  const props = node.props;
  return cloneElement(
    node,
    {
      ...props,
      ...(props.placeholder ? { placeholder: translateText(props.placeholder, language) } : {}),
      ...(props.title ? { title: translateText(props.title, language) } : {}),
      ...(props["aria-label"] ? { "aria-label": translateText(props["aria-label"], language) } : {}),
    },
    localizeNode(props.children, language),
  );
}

export function LocalizedContent({ children }: { children: ReactNode }) {
  const { language } = useLocale();
  return <>{localizeNode(children, language)}</>;
}
