import { THEME_STORAGE_KEY } from "@/lib/theme/theme";

export function ThemeScript() {
  const script = `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
