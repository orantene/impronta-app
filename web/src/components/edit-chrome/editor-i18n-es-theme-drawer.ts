/**
 * Spanish strings for the talent theme editor (Diseño → Tema): tabs, token
 * labels, option names, contrast messages and the Discard / Save / Publish
 * footer (TUL-542). Split out so editor-i18n-es.ts stays under the 800-line cap.
 */

export const ES_THEME_DRAWER_TEXT: Record<string, string> = {
  // Header and footer
  "Theme · loading…": "Tema · cargando…",
  "Theme · {name}": "Tema · {name}",
  "Theme · Custom": "Tema · Personalizado",
  "Loading theme…": "Cargando tema…",
  "Site theme": "Tema del sitio",
  "Published {date}": "Publicado el {date}",
  "Never published": "Nunca publicado",
  "This page has no theme to edit yet.": "Esta página aún no tiene un tema para editar.",
  "Could not apply theme preset.": "No se pudo aplicar el tema predefinido.",
  "Discard changes": "Descartar cambios",
  "Yes, publish": "Sí, publicar",
  "Publish theme": "Publicar tema",
  "Save your changes without going live": "Guarda tus cambios sin publicarlos",
  "Publish theme to live storefront": "Publica el tema en tu sitio en vivo",
  "Draft already matches live": "El borrador ya coincide con el sitio en vivo",
  "This will replace what visitors see.": "Esto reemplazará lo que ven tus visitantes.",
  "Re-publish current draft?": "¿Volver a publicar el borrador actual?",
  "⚠ {n} color pairs fail WCAG AA.": "⚠ {n} pares de colores no cumplen WCAG AA.",
  "⚠ {n} color pair fails WCAG AA.": "⚠ {n} par de colores no cumple WCAG AA.",

  // Tabs
  "Effects": "Efectos",
  "Components": "Componentes",

  // Colors tab
  "Background color": "Color de fondo",
  "Background texture": "Textura de fondo",
  "The main background of your site. White (#ffffff) by default.":
    "El fondo principal de tu sitio. Blanco (#ffffff) por defecto.",
  "Layers warmth or grain over the background color above. Also in Layout tab.":
    "Agrega calidez o grano sobre el color de fondo de arriba. También está en la pestaña Diseño.",
  "Editorial palette": "Paleta editorial",
  "Buttons, links, focus rings.": "Botones, enlaces y anillos de enfoque.",
  "Supporting UI text.": "Texto de apoyo de la interfaz.",
  "Highlights, badges, hover tints.": "Resaltados, insignias y tonos al pasar el cursor.",
  "Quiet text + subtle borders.": "Texto discreto y bordes sutiles.",
  "Ink": "Tinta",
  "Muted text": "Texto atenuado",
  "A11y · contrast": "Accesibilidad · contraste",

  // Contrast checker
  "WCAG contrast": "Contraste WCAG",
  "All pass": "Todo cumple",
  "{n} failing": "{n} no cumplen",
  "Ink on Surface": "Tinta sobre superficie",
  "Primary on Background": "Primario sobre fondo",
  "Secondary on Surface": "Secundario sobre superficie",
  "Muted text on Surface": "Texto atenuado sobre superficie",
  "Accent on Background": "Acento sobre fondo",
  "Fails AA": "No cumple AA",
  "AA large only": "AA solo para texto grande",
  "AA pass": "Cumple AA",
  "AAA pass": "Cumple AAA",

  // Typography tab
  "Heading font": "Fuente de títulos",
  "Body font": "Fuente del cuerpo",
  "Navigation font": "Fuente de navegación",
  "Eyebrow / label": "Sobretítulo / etiqueta",
  "Type scale": "Escala tipográfica",
  "Heading tracking": "Espaciado de títulos",
  "Sans": "Sans",
  "Serif": "Serif",
  "Script": "Script",
  "Editorial serif": "Serif editorial",
  "Refined sans": "Sans refinada",
  "Tracked caps": "Mayúsculas espaciadas",
  "Italic serif": "Serif cursiva",
  "Sans bold": "Sans en negrita",
  "Loose": "Amplio",
  "Wide (airy serif)": "Ancho (serif aireada)",
  "Google Fonts": "Google Fonts",
  "Heading family": "Familia de títulos",
  "Body family": "Familia del cuerpo",
  "Overrides the heading-preset above. Loads on save + publish.":
    "Reemplaza el ajuste de títulos de arriba. Se carga al guardar y publicar.",
  "Type scale (h1–h6)": "Escala tipográfica (h1–h6)",
  "Free CSS length values (clamp(), px, rem, %). Empty = use the type-scale preset above.":
    "Valores de longitud CSS libres (clamp(), px, rem, %). Vacío = usar la escala tipográfica de arriba.",
  "Bundled": "Incluida",
  "All Google Fonts": "Todas las Google Fonts",
  "Your fonts": "Tus fuentes",
  "No fonts match.": "Ninguna fuente coincide.",

  // Layout tab
  "Spacing rhythm": "Ritmo de espaciado",
  "Section padding": "Relleno de secciones",
  "Cozy": "Acogedor",
  "Pillowy": "Mullido",
  "Editorial backgrounds layer subtle warmth or grain over the page.":
    "Los fondos editoriales agregan calidez o grano sutil sobre la página.",
  "Noise": "Ruido",
  "Mesh sage": "Malla salvia",
  "Mesh aurora": "Malla aurora",
  "Noise (animated)": "Ruido (animado)",
  "Noir & Or": "Noir & Or",
  "Atelier Blanc": "Atelier Blanc",

  // Effects tab
  "Chat style": "Estilo del chat",
  "Card is the calm one-to-one look Maison v2 uses by default.":
    "Tarjeta es el estilo tranquilo de uno a uno que Maison v2 usa por defecto.",
  "Shadow weight": "Intensidad de sombras",
  "Crisp": "Nítida",
  "Ambient": "Ambiental",
  "All presets respect prefers-reduced-motion.":
    "Todos los ajustes respetan la preferencia de movimiento reducido.",
  "Snappy": "Ágil",
  "Refined": "Refinado",
  "Reveal stagger": "Escalonado de aparición",
  "Dramatic": "Dramático",

  // Components tab
  "Body text": "Texto del cuerpo",
  "Label color": "Color de la etiqueta",
  "Custom color…": "Color personalizado…",
  "Inherit (theme default)": "Heredar (predeterminado del tema)",
  "Bind to a token so it follows your palette, or pick a custom color.":
    "Vincúlalo a un token para que siga tu paleta, o elige un color personalizado.",
  "Set a default look per element type. Every element of that type starts here; any one element can still override it. Bind to a theme token so the default follows your palette. Changes preview on the canvas live, Save draft, then Publish theme to go live.":
    "Define un estilo predeterminado por tipo de elemento. Cada elemento de ese tipo parte de aquí y cualquiera puede cambiarlo. Vincúlalo a un token del tema para que siga tu paleta. Los cambios se ven en vivo en el lienzo: guarda el borrador y luego publica el tema para que quede en vivo.",
  "On primary": "Sobre primario",
  "Accent for text": "Acento para texto",
  "Blush / italic accent": "Rubor / acento cursivo",
  "Sage / soft accent": "Salvia / acento suave",
  "Ink (strong text)": "Tinta (texto fuerte)",
  "Divider / line": "Divisor / línea",
  "Raised surface (cards)": "Superficie elevada (tarjetas)",
  "Price chip colour": "Color de la etiqueta de precio",
  "Card surface": "Superficie de la tarjeta",
  "Card name color": "Color del nombre en la tarjeta",
  "Card secondary text": "Texto secundario de la tarjeta",
  "Button corners": "Esquinas de los botones",
  "Card corners": "Esquinas de las tarjetas",
  "Photo corners, phone": "Esquinas de fotos, teléfono",
  "Photo corners, desktop": "Esquinas de fotos, escritorio",
  "Tile corners": "Esquinas de los mosaicos",
  "Thumbnail corners": "Esquinas de las miniaturas",
  "Chip corners": "Esquinas de las etiquetas",
  "Menu rail corners": "Esquinas del riel del menú",
  "Portrait arch": "Arco del retrato",
  "Radius: small": "Radio: pequeño",
  "Radius: base": "Radio: base",
  "Radius: large": "Radio: grande",
  "Radius: pill": "Radio: píldora",
  "Shadow: soft": "Sombra: suave",
  "Shadow: ambient": "Sombra: ambiental",
  "Spacing: section rhythm": "Espaciado: ritmo de secciones",
  "Type: H1 size": "Tipografía: tamaño H1",
  "Type: H2 size": "Tipografía: tamaño H2",
  "Type: H3 size": "Tipografía: tamaño H3",
  "Type: body size": "Tipografía: tamaño del cuerpo",

  // Code tab
  "Theme JSON": "JSON del tema",
  "{n} tokens": "{n} tokens",
  "Copy JSON": "Copiar JSON",
  "Copied": "Copiado",
  "Select all (clipboard blocked)": "Seleccionar todo (portapapeles bloqueado)",
  "Theme preset": "Tema predefinido",
  "Editorial Bridal": "Editorial nupcial",
  "Studio Minimal": "Estudio minimal",
  "Editorial Noir": "Editorial noir",
  "Clean white default": "Blanco limpio por defecto",
  "Sans, crisp, legacy": "Sans, nítida, clásica",
  "Warm ivory serif": "Serif en marfil cálido",
  "Monochrome gallery": "Galería monocromática",
  "Black + gold (Impronta)": "Negro y dorado (Impronta)",
  "Applies the preset bundle to your draft. Click Publish to make it live on the storefront.":
    "Aplica el tema predefinido a tu borrador. Pulsa Publicar para verlo en vivo en tu sitio.",
  "Read-only. Edit through the controls above.":
    "Solo lectura. Edita con los controles de arriba.",
  "Reset to platform defaults": "Restablecer a los valores de la plataforma",
  "Power tools": "Herramientas avanzadas",
  "Bulk-apply tokens or generate visual recipes.":
    "Aplica tokens en bloque o genera recetas visuales.",
  "Brand-kit import": "Importar kit de marca",
  "Paste a JSON token bundle or extract from a URL.":
    "Pega un paquete de tokens en JSON o extráelo desde una URL.",
  "Mesh gradient generator": "Generador de degradados de malla",
  "Compose a free mesh background and copy the CSS.":
    "Crea un fondo de malla libre y copia el CSS.",
  "Mesh gradient preview": "Vista previa del degradado de malla",
  "Base": "Base",
  "+ Stop": "+ Punto",
  "− Stop": "− Punto",
  "CSS output": "Código CSS",
  "Hide brand-kit import": "Ocultar importación del kit de marca",
  "Import brand kit (JSON)": "Importar kit de marca (JSON)",
  "Or extract from a website URL": "O extrae desde la URL de un sitio web",
  "Extract": "Extraer",
  "Best-effort scan for brand colors + Google Fonts on the page. Result fills the box below, review then click Apply.":
    "Búsqueda aproximada de colores de marca y Google Fonts en la página. El resultado llena el cuadro de abajo: revísalo y pulsa Aplicar.",
  "Hex colors normalize to #rrggbb. Unknown keys are dropped on save. Apply does not save, review then click Save draft.":
    "Los colores hex se normalizan a #rrggbb. Las claves desconocidas se descartan al guardar. Aplicar no guarda: revisa y pulsa Guardar borrador.",
  "Apply to draft": "Aplicar al borrador",
  "Not valid JSON. Check the format.": "JSON no válido. Revisa el formato.",
  "Expected a flat JSON object of token → value.":
    "Se esperaba un objeto JSON plano de token → valor.",
  "We couldn't read anything useful from that JSON.":
    "No pudimos leer nada útil de ese JSON.",
  "Failed to extract brand kit.": "No se pudo extraer el kit de marca.",
  "Applied {n} token to the draft. Click Save draft in the footer to persist.":
    "Se aplicó {n} token al borrador. Pulsa Guardar borrador abajo para conservarlo.",
  "Applied {n} tokens to the draft. Click Save draft in the footer to persist.":
    "Se aplicaron {n} tokens al borrador. Pulsa Guardar borrador abajo para conservarlo.",
};
