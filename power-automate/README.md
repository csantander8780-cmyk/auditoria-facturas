# Conectar la app a SharePoint con Power Automate

Esto reemplaza el Apps Script de Google: es el "puente" que recibe cada auditoría
que manda la app y agrega una fila por cada ítem a un Excel guardado en SharePoint.

## Antes de empezar

Necesitas un Excel (.xlsx) guardado en una biblioteca de documentos de SharePoint
(o en el OneDrive de tu equipo, también sirve), con **una tabla con estos encabezados**
en la primera fila:

```
Fecha envío | ID auditoría | Hoja de ruta | N° Factura | Proveedor | Fecha factura |
Auditor | Turno | Código | Descripción | Cantidad factura | Unidad | Cantidad real |
Estado | Sobrante | Observación
```

Para que quede como "tabla" de verdad (no solo celdas con texto): selecciona el rango,
**Insertar → Tabla**, y ponle un nombre fácil de reconocer (ej. `TablaAuditorias`) en
**Diseño de tabla → Nombre de la tabla**.

## Armar el flujo

1. Entra a **make.powerautomate.com** con tu cuenta del trabajo.
2. **Crear → Flujo de nube instantáneo**.
3. Como disparador, busca **"Cuando se recibe una solicitud HTTP"** (conector "Solicitud").
   - Si no te aparece o te pide plan Premium, avísame — hay una alternativa usando
     Power Automate "Desktop"/Forms que no necesita ese conector, pero es más enredada.
4. En el disparador, click **"Usar un ejemplo de carga para generar el esquema"** y pega
   el contenido de `sample-payload.json` (está en esta misma carpeta). Esto le enseña al
   flujo la forma de los datos que le va a mandar la app.
5. Agrega un paso **"Aplicar a cada uno"** (Apply to each), y en el campo de la lista
   elige `items` (viene del disparador anterior).
6. Dentro de ese "Aplicar a cada uno", agrega el paso **Excel Online (Business) →
   "Agregar una fila a una tabla"**.
   - Ubicación: SharePoint (o OneDrive para la empresa).
   - Biblioteca de documentos / Sitio: donde guardaste el Excel.
   - Archivo: tu Excel.
   - Tabla: `TablaAuditorias` (o el nombre que le pusiste).
   - En cada columna, usa el contenido dinámico: la mayoría viene de `header` (fuera
     del "Aplicar a cada uno", así que Power Automate lo deja elegir igual) y los
     campos de ítem (`codigo`, `descripcion`, `cantidadFactura`, `unidad`,
     `cantidadReal`, `estado`, `sobrante`, `observacion`) vienen del elemento actual
     del ciclo. "Fecha envío" puedes dejarlo con la función `utcNow()`.
7. Fuera del "Aplicar a cada uno" (después de que termine el ciclo), agrega el paso
   **Solicitud → "Responder a un PowerApp o flujo"** o simplemente **"Respuesta"**
   con código 200 — así la app sabe que quedó guardado. Si no encuentras ese paso,
   cualquier acción que termine el flujo sin error también sirve.
8. Guarda el flujo. Power Automate te muestra la **URL HTTP POST** del disparador
   (volviendo a abrir el paso 1 del flujo, ahí aparece después de guardar).
9. Copia esa URL y pégala en la app → pestaña **Historial → Destino de los datos**.

Listo: desde ese momento, cada vez que termines una auditoría en la app, se agregan
las filas solas al Excel de SharePoint.

## Si no tienes el conector "Solicitud" (Premium)

Algunas licencias de Microsoft 365 no incluyen el conector HTTP Request sin pagar un
plan de Power Automate aparte. Si es tu caso, las alternativas son:
- Pedir a TI que active un plan "Power Automate per user" (suele ser barato, a veces
  ya incluido en licencias E3/E5).
- Usar Microsoft Forms como intermediario (más vueltas, te lo puedo armar si prefieres
  este camino).
- Seguir usando Google Sheets (gratis, sin este problema) y solo exportar a Excel
  cuando lo necesites — ver el README principal.
