/**
 * Spanish for the Theme drawer chrome (live1 theme-editor / TUL-536 Issues).
 * Preset *names* (Aurora, Noir, Maison…) stay as authored when already in
 * other catalogs; this file only holds Theme-drawer-unique keys. UI chrome
 * that already exists in ES_TEXT is intentionally omitted to keep the
 * es-parity duplicate guard green.
 */

export const ES_THEME_TEXT: Record<string, string> = {
  Effects: "Efectos",
  Components: "Componentes",
  "Theme · loading…": "Tema · cargando...",
  "Theme · Custom": "Tema · Personalizado",
  "Loading theme…": "Cargando tema...",
  "Site theme": "Tema del sitio",
  "Never published": "Nunca publicado",
  "This page has no theme to edit yet.": "Esta página aún no tiene un tema para editar.",
  // Colors tab
  "Editorial palette": "Paleta editorial",
  "A11y · contrast": "Accesibilidad · contraste",
  "Background texture": "Textura de fondo",
  "Layers warmth or grain over the background color above. Also in Layout tab.":
    "Agrega calidez o grano sobre el color de fondo de arriba. También en la pestaña Diseño.",
  "Buttons, links, focus rings.": "Botones, enlaces, anillos de foco.",
  "Supporting UI text.": "Texto de apoyo de la interfaz.",
  "Highlights, badges, hover tints.": "Resaltados, insignias, tintes al pasar el cursor.",
  "Quiet text + subtle borders.": "Texto discreto y bordes sutiles.",
  Ink: "Tinta",
  "Muted text": "Texto atenuado",
  "Heading font": "Fuente de títulos",
  "Body font": "Fuente del cuerpo",
  "Eyebrow / label": "Antetítulo / etiqueta",
  "Type scale": "Escala tipográfica",
  "Heading tracking": "Tracking de títulos",
  "Spacing rhythm": "Ritmo de espaciado",
  "Section padding": "Relleno de sección",
  "Editorial backgrounds layer subtle warmth or grain over the page.":
    "Los fondos editoriales agregan calidez o grano sutil sobre la página.",
  "Shadow weight": "Peso de sombra",
  "Reveal stagger": "Revelado escalonado",
  "Chat style": "Estilo del chat",
  Sans: "Sans",
  Serif: "Serif",
  "Editorial serif": "Serif editorial",
  "Cinzel editorial": "Cinzel editorial",
  "Refined sans": "Sans refinada",
  "Tracked caps": "Mayúsculas con tracking",
  "Italic serif": "Serif cursiva",
  "Sans bold": "Sans negrita",
  Loose: "Holgado",
  "Wide (airy serif)": "Ancho (serif aireado)",
  Cozy: "Acogedor",
  Pillowy: "Almohadillado",
  Dramatic: "Dramático",
  Refined: "Refinado",
  Crisp: "Nítido",
  Ambient: "Ambiente",
  Snappy: "Ágil",
  "Noise (animated)": "Ruido (animado)",
  // Card titles used by PresetsTab callers,
  "This will replace what visitors see.":
    "Esto reemplazará lo que ven los visitantes.",
  "Re-publish current draft?": "¿Volver a publicar el borrador actual?",
  "color pair fails WCAG AA": "par de colores no cumple WCAG AA",
  "color pairs fail WCAG AA": "pares de colores no cumplen WCAG AA",
  "Discard changes": "Descartar cambios",
  "Yes, publish": "Sí, publicar",
  "Save your changes without going live":
    "Guarda tus cambios sin publicarlos",
  "Publish theme to live storefront":
    "Publicar el tema en la tienda en vivo",
  "Draft already matches live": "El borrador ya coincide con lo publicado",
  "Publish theme": "Publicar tema",
  // Typography extras,
  "Google Fonts": "Google Fonts",
  "Heading family": "Familia de títulos",
  "Body family": "Familia del cuerpo",
  "Overrides the heading-preset above. Loads on save + publish.":
    "Anula el preset de títulos de arriba. Se carga al guardar y publicar.",
  "Type scale (h1–h6)": "Escala tipográfica (h1–h6)",
  "Free CSS length values (clamp(), px, rem, %). Empty = use the type-scale preset above.":
    "Valores CSS libres (clamp(), px, rem, %). Vacío = usa el preset de escala de arriba.",
  "Background color": "Color de fondo",
  "The main background of your site. White (#ffffff) by default.":
    "El fondo principal de tu sitio. Blanco (#ffffff) por defecto.",
  // Advanced / Code tab,
  "Theme JSON": "JSON del tema",
  Copied: "Copiado",
  "Select all (clipboard blocked)":
    "Seleccionar todo (portapapeles bloqueado)",
  "Theme preset": "Preset de tema",
  "Applies the preset bundle to your draft. Click Publish to make it live on the storefront.":
    "Aplica el paquete del preset a tu borrador. Haz clic en Publicar para llevarlo a la tienda en vivo.",
  "Read-only. Edit through the controls above.":
    "Solo lectura. Edita con los controles de arriba.",
  "Reset to platform defaults": "Restablecer valores de la plataforma",
  "Power tools": "Herramientas avanzadas",
  "Bulk-apply tokens or generate visual recipes.":
    "Aplica tokens en bloque o genera recetas visuales.",
  "Brand-kit import": "Importar kit de marca",
  "Paste a JSON token bundle or extract from a URL.":
    "Pega un paquete JSON de tokens o extráelo de una URL.",
  "Mesh gradient generator": "Generador de degradado mesh",
  "Compose a free mesh background and copy the CSS.":
    "Compón un fondo mesh libre y copia el CSS.",
  // Preset option hints / names that Segmented + FieldLabel surface
  Noise: "Ruido",
  "Mesh sage": "Mesh salvia",
  "Mesh aurora": "Mesh aurora",
  "Noir & Or": "Noir & Or",
  "Atelier Blanc": "Atelier Blanc",
  "Card is the calm one-to-one look Maison v2 uses by default.":
    "Card es el look uno a uno calmado que Maison v2 usa por defecto.",
  "All presets respect prefers-reduced-motion.":
    "Todos los presets respetan prefers-reduced-motion.",
  "Clean white default": "Blanco limpio por defecto",
  "Sans, crisp, legacy": "Sans, nítido, legado",
  "Editorial Bridal": "Editorial Bridal",
  "Warm ivory serif": "Serif marfil cálido",
  "Studio Minimal": "Studio Minimal",
  "Monochrome gallery": "Galería monocroma",
  "Editorial Noir": "Editorial Noir",
  "Black + gold (Impronta)": "Negro + oro (Impronta)",
  "Could not apply theme preset.": "No se pudo aplicar el preset de tema.",
};
