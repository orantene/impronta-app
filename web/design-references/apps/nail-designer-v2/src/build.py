# Inline src/style.css and src/app.js into ../nail-designer.html
import os
here = os.path.dirname(os.path.abspath(__file__))
html_path = os.path.join(here, '..', 'nail-designer.html')
css = open(os.path.join(here, 'style.css')).read()
js = open(os.path.join(here, 'app.js')).read()
html = open(html_path).read()
s = html.index('<style>\n') + 8; e = html.index('</style>'); html = html[:s] + css + html[e:]
s = html.index('<script>\n') + 9; e = html.index('</script>'); html = html[:s] + js + html[e:]
open(html_path, 'w').write(html)
print('built', html_path)
