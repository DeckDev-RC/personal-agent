import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ptBR from "./pt-BR.json";
import en from "./en.json";
import es from "./es.json";
import de from "./de.json";
import zhCN from "./zh-CN.json";
import zhTW from "./zh-TW.json";

i18n.use(initReactI18next).init({
  resources: {
    "pt-BR": { translation: ptBR },
    en: { translation: en },
    es: { translation: es },
    de: { translation: de },
    "zh-CN": { translation: zhCN },
    "zh-TW": { translation: zhTW },
  },
  lng: "pt-BR",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
