# Análisis de pasos Dynamics – Envío, localización y registro de ventas

---

## Resumen: 1072 documentos en PASO 1 (estado 1) por fallos en PASO 3

Si tienes **~1072 documentos aún en “PASO 1”** (estado 1 = Enviada), significa que **no están pasando a estado 2** porque **en PASO 3 algo los está filtrando o el PATCH está fallando**. Causas más probables y qué revisar:

### Causas más probables (PASO 3 – Ges_Localizacion_Dyn)

| # | Causa | Dónde ocurre | Qué revisar |
|---|--------|----------------|-------------|
| **1** | **Ventana de fecha por defecto** | `@Fecha = Isnull( @Fecha , GETDATE()-10 )` (línea 72). Solo se procesan documentos con `Convert( date , L.Fecha ) >= @Fecha`. Si los 1072 son de hace más de 10 días, **nunca entran** al UPDATE. | Pasar `@Fecha` más antigua al ejecutar PASO 3 (ej. `GETDATE()-60` o la fecha mínima de tus pendientes). |
| **2** | **Dynamics no devuelve esos documentos** | `#Documentos` se llena **solo** con lo que devuelven las APIs `Ventas_Pendiente_TI` y `Nota_Credito_Pendiente_TI`. Si BC ya no los considera “pendientes” o el OData tiene otro filtro, **no aparecen** y nunca se hace el JOIN. | Revisar en BC qué incluyen esas páginas/APIs. Revisar `Ges_ConsumeAPI` por timeouts o respuestas truncadas. |
| **3** | **Join cabecera + estado 1** | El UPDATE solo matchea si: mismo `Cod_Empresa`, `Doc.Documento = Cab.Nro_Impreso`, y `L.estado in (1)` y `Convert( date , L.Fecha ) >= @Fecha`. Si `Nro_Impreso` tiene formato distinto al que viene del API, el JOIN no hace match y luego `Delete ... where Doc.Id is null` **borra** esos registros. | Revisar que en BLE/FCV/NCV el `Nro_Impreso` coincida con el número que devuelve Dynamics (sin prefijo 39-/33-/61-). |
| **4** | **PATCH a Dynamics falla (≠ 200)** | Si `Ges_ConsumeAPI` devuelve 401, 403, 404, 412, 500, etc., el documento **no** se actualiza a estado 2. Los errores se meten en `#Salida_Error` pero **no** se persisten a `Ges_Salida_Error_Dyn` (ver bug abajo). | Revisar `Ges_Salida_Error_Dyn` y/o logs; revisar **Ges_ConsumeAPI** y **Ges_ObtieneToken2_Dyn**. |
| **5** | **Token distinto para localización** | PASO 3 usa **Ges_ObtieneToken2_Dyn** para el PATCH. Si ese token expira o no tiene permiso sobre la API `LegalSalesDocument`, el PATCH falla. | Revisar **Ges_ObtieneToken2_Dyn** y alcance del token (scope/API). |
| **6** | **URL de localización / company** | Si `@Id_EmpresaDYM` (salida de `Ges_ObtieneToken_Dyn`) no es el company correcto en Dynamics, el PATCH puede devolver 404. | Revisar que el company ID coincida con el environment correcto. |

### Procedimientos que conviene revisar

1. **Ges_Localizacion_Dyn** (PASO 3) – Filtro de `@Fecha`, JOINs, y bug de errores no persistidos.
2. **Ges_ObtieneToken_Dyn** – Token para GET de pendientes.
3. **Ges_ObtieneToken2_Dyn** – Token para el PATCH de localización.
4. **Ges_ConsumeAPI** – Llamada al PATCH (headers, timeouts, códigos de error).
5. **Ventas_Pendiente_TI / Nota_Credito_Pendiente_TI** en BC – Que devuelvan los 1072 documentos.

### Bug en PASO 3: errores de localización no se guardan en Ges_Salida_Error_Dyn

Cuando el PATCH falla (líneas 394–404), se hace `Insert Into #Salida_Error ...`. Pero al final se hace `Insert into Ges_Salida_Error_Dyn ... from #Errores E`. En este SP **#Errores nunca se llena**; solo se llena **#Salida_Error**. Por tanto los fallos de localización **no se persisten** en `Ges_Salida_Error_Dyn`. Habría que insertar en `Ges_Salida_Error_Dyn` desde `#Salida_Error` (ajustando columnas) o llenar `#Errores` cuando el PATCH falle.

### Evaluación "ya tiene localización" en PASO 3

Si en Dynamics el documento **ya tiene la localización** aplicada, el PATCH puede devolver 400/409 u otro código en lugar de 200, y PASO 3 no actualizaba el estado a 2, dejando el documento atascado en estado 1.

**Cambio aplicado en `Ges_Localizacion_Dyn` (PASO 3):**  
Si el PATCH devuelve **400 o 409** y el mensaje de respuesta contiene alguna de estas cadenas (sin distinguir mayúsculas): `localizacion`, `localization`, `already`, `already has`, `ya tiene`, se considera **éxito** y se actualiza `Ges_EstadoEnvioDynamics.Estado = 2` igual que cuando el PATCH responde 200. Así el documento puede seguir a PASO 4 (registro) aunque en BC ya esté localizado. Si Dynamics devuelve otro texto para "ya localizado", se pueden añadir más condiciones en el `Else If`.

### Diagnóstico para un documento concreto (ej. 6421395)

Si las fechas están bien y aun así un documento como **6421395** sigue en estado 1, el fallo está en uno de estos puntos:

1. **La API de Dynamics no lo devuelve** en `Ventas_Pendiente_TI` / `Nota_Credito_Pendiente_TI` (BC ya no lo considera pendiente de localización, o el OData tiene otro filtro).
2. **El JOIN no hace match**: en PASO 3 se matchea `Doc.Documento` (lo que viene del API, ej. `'6421395'`) con `Convert( varchar , Cab.Nro_Impreso )`. Si en cabecera `Nro_Impreso` es distinto (espacios, ceros a la izquierda, tipo numérico que convierte distinto), el UPDATE no asigna `Id` y luego se borra con `Delete ... where Doc.Id is null`.
3. **El PATCH falla** y como los errores no se guardan en `Ges_Salida_Error_Dyn`, no ves el motivo.

**Consultas de diagnóstico** (ejecutar en el servidor de Gestion):

```sql
-- 1) ¿Existe 6421395 en Ges_EstadoEnvioDynamics en estado 1? (y de qué tipo es: BLE/FCV/NCV)
SELECT L.Id_Documento, L.Id_Documento_Dynamics, L.Estado, L.Fecha, L.Id_Documento_Detalle,
       B.Nro_Impreso AS BLE_Nro, F.Nro_Impreso AS FCV_Nro, N.Nro_Impreso AS NCV_Nro,
       Convert(varchar(20), B.Nro_Impreso) AS BLE_Nro_Varchar,
       Convert(varchar(20), F.Nro_Impreso) AS FCV_Nro_Varchar,
       Convert(varchar(20), N.Nro_Impreso) AS NCV_Nro_Varchar
FROM Ges_EstadoEnvioDynamics L WITH (NOLOCK)
LEFT JOIN Ges_BlvCabecera B WITH (NOLOCK) ON B.Id_Boleta = L.Id_Documento
LEFT JOIN Ges_FcvCabecera F WITH (NOLOCK) ON F.Id_Factura = L.Id_Documento
LEFT JOIN Ges_NcvCabecera N WITH (NOLOCK) ON N.Id_NotaCredito = L.Id_Documento
WHERE L.Estado = 1
  AND (B.Nro_Impreso = 6421395 OR F.Nro_Impreso = 6421395 OR N.Nro_Impreso = 6421395
       OR Convert(varchar(20), B.Nro_Impreso) = '6421395'
       OR Convert(varchar(20), F.Nro_Impreso) = '6421395'
       OR Convert(varchar(20), N.Nro_Impreso) = '6421395');

-- 2) Si es BLE: cabecera y empresa (para pasar @Cod_Empresa y @Fecha a PASO 3)
SELECT Cab.Id_Boleta, Cab.Cod_Empresa, Cab.Nro_Impreso, Cab.Fecha_Emision, Cab.Total,
       Convert(varchar(20), Cab.Nro_Impreso) AS Nro_Impreso_Varchar
FROM Ges_BlvCabecera Cab WITH (NOLOCK)
INNER JOIN Ges_EstadoEnvioDynamics L WITH (NOLOCK) ON L.Id_Documento = Cab.Id_Boleta AND L.Estado = 1
WHERE Cab.Nro_Impreso = 6421395 OR Convert(varchar(20), Cab.Nro_Impreso) = '6421395';

-- 3) ¿Aparece en Ges_Salida_Error_Dyn? (por si en algún momento sí se guardó el error)
SELECT * FROM Ges_Salida_Error_Dyn WITH (NOLOCK)
WHERE Numero LIKE '%6421395%' OR Error LIKE '%6421395%'
ORDER BY Fecha DESC;
```

**Interpretación:**

- **Consulta 1:** Si no devuelve filas, el 6421395 no está en estado 1 en `Ges_EstadoEnvioDynamics` (o está en otra tabla por tipo de documento). Si devuelve filas, anota `Id_Documento_Dynamics`, `Cod_Empresa` (de la cabecera) y `Fecha`. Comprueba que `BLE_Nro_Varchar` (o FCV/NCV) sea exactamente `'6421395'`; si tiene espacios o formato distinto, el JOIN en PASO 3 puede fallar.
- **Consulta 2:** Confirma empresa y fecha para ejecutar PASO 3 con ese `@Cod_Empresa` y `@Fecha`.
- **Consulta 3:** Si aparece algo, el PATCH sí falló y el error quedó registrado (o vino de otro proceso). Si no aparece y el doc sigue en 1, lo más probable es que **la API no devuelva ese documento** o que el JOIN no matchee; conviene revisar en Business Central qué devuelve `Ventas_Pendiente_TI` para ese número (ej. `39-6421395` o `33-6421395`).

### Error 3: 400 + "Referencia a objeto no establecida como instancia de un objeto"

Cuando el GET a **Ventas_Pendiente_TI** devuelve **400** con ese mensaje:

- **Dónde ocurre:** En la primera llamada de PASO 3: `GET .../Company('International Sport SA')/Ventas_Pendiente_TI`.
- **Qué significa:** "Referencia a objeto no establecida" es una excepción .NET (null reference). Lo más probable es que **en Business Central** (o en el API que expone esa página) algo esté null cuando no debería: un campo, un registro relacionado o la resolución de la compañía. Es decir, el fallo suele estar **del lado de BC**, no en SQL.
- **¿Otro proceso puede afectar?** En principio un **400** es por la petición o el estado del servidor en ese momento. Otro proceso (PASO 2, otro PASO 3, jobs) no suele cambiar el formato de la URL ni el nombre de la compañía. Sí podría afectar si:
  - Un job en BC modifica datos que **Ventas_Pendiente_TI** usa y deja algo en un estado inconsistente (null).
  - Hay bloqueos o timeouts si varios procesos llaman al mismo endpoint a la vez (más típico de 500/timeout que de 400).
- **Qué revisar:**
  1. **En Business Central:** La página/query **Ventas_Pendiente_TI** para la compañía "International Sport SA": filtros, campos obligatorios, relaciones; que no acceda a algo que pueda ser null (cliente, empresa, configuración).
  2. **Formato de la URL:** Algunos OData/BC esperan el nombre de compañía con espacios codificados. Probar la misma URL con `Company('International%20Sport%20SA')` en lugar de `Company('International Sport SA')` (o el formato que use `Ges_ObtieneToken_Dyn` para `@Nombre_Emp`). Si en BC el nombre exacto es otro (sin espacio, con guión, etc.), hay que usar ese.
  3. **Ges_ObtieneToken_Dyn:** Confirmar que para esa `@Cod_Empresa` (TL) el nombre devuelto en `@Nombre_Emp` es exactamente el que BC tiene como nombre de compañía en el tenant (sensible a mayúsculas/espacios).

**Solución aplicada:** Si al probar la URL con el nombre de compañía **codificado** (`International%20Sport%20SA`) el GET responde **200**, el problema es el espacio en la URL. En ese caso hay que armar la URL con `REPLACE(@Nombre_Emp, ' ', '%20')` y usar ese valor entre comillas en `Company('...')`. Esto ya está aplicado en **Ges_Localizacion_Dyn_Prueba** y en el script del PASO 3 original (Ges_Localizacion_Dyn).

### Revisión del flujo completo (incluir PASO 1)

Para ver si algo en PASO 1 o en otro paso afecta al GET de PASO 3, conviene revisar el flujo de punta a punta:

| Paso | Procedimiento | Qué hace | Qué revisar si hay problemas |
|------|----------------|----------|------------------------------|
| **PASO 1** | `Ges_EnviaVenta_Dyn` | Arma cabecera/detalle, envía a Dynamics, actualiza estado 0 → 1. | Que no toque la API Ventas_Pendiente_TI ni la compañía de forma que deje datos null en BC. Que el nombre de compañía que use para enviar sea el mismo que usa PASO 3. |
| **PASO 2** | `Ges_Envia_Ventas_Asyncrono` | Solo ejecuta 4 veces `Ges_EnviaVenta_Dyn`. | No llama a Ventas_Pendiente_TI; no debería causar el 400. |
| **PASO 3** | `Ges_Localizacion_Dyn` | GET Ventas_Pendiente_TI y Nota_Credito_Pendiente_TI, cruce con cabeceras, PATCH localización, estado 1 → 2. | Aquí falla el GET (Error 3). Revisar URL, empresa y en BC la página Ventas_Pendiente_TI. |
| **PASO 4** | `Ges_Registra_Venta__Dyn` | GET pendientes (misma API), solo estado 2, POST para registrar, estado 2 → 3. | Misma API que PASO 3; si el GET fallaba en 3 por URL con espacio, también fallaba aquí. **Corregido:** PASO 4 usa nombre de compañía codificado (`%20`) en las URLs de los GET. Si aun así no pasan a 3, ver sección "Documentos en estado 2 que no pasan a estado 3". |

**PASO 1** no está en los archivos compartidos; está en el servidor como **`Ges_EnviaVenta_Dyn`**. Para revisarlo completo hace falta abrir ese procedimiento en el servidor (o pegar aquí el script) y comprobar:

- Cómo obtiene el nombre de compañía / Id de empresa para Dynamics.
- Que sea el mismo criterio que usa **Ges_ObtieneToken_Dyn** para TL (466819CB-DCFB-43D4-AE13-E1233D551A47 → "International Sport SA").
- Que no llame ni dependa de Ventas_Pendiente_TI (PASO 1 solo envía documentos; la lista de pendientes la usa PASO 3 y 4).

Si compartes el script de **Ges_EnviaVenta_Dyn** (PASO 1), se puede revisar si algo de ahí puede dejar datos en BC que provoquen el null en Ventas_Pendiente_TI.

---

## 1. ¿Se arma la cabecera en PASO 2?

**No.** En el script **PASO 2** (`Ges_Envia_Ventas_Asyncrono`) **no se arma ninguna cabecera**.

- El procedimiento solo **orquesta**: ejecuta 4 veces (subprocesos) el procedimiento `gestion.dbo.Ges_EnviaVenta_Dyn` pasando `@Cod_Empresa`, `@Fecha`, `@Posicion` (1..4) y `@Procesos` (4).
- La construcción de cabecera (y envío a Dynamics) ocurre **dentro de `Ges_EnviaVenta_Dyn`**, que no está en los archivos revisados. Para verificar cómo se arma la cabecera hay que abrir ese procedimiento (PASO 1 / `Ges_EnviaVenta_Dyn`) en el servidor.

Resumen: **PASO 2 = lanzador de 4 jobs que llaman a `Ges_EnviaVenta_Dyn`**. La cabecera se arma en ese otro proc.

---

## 2. Diferencias entre PASO 2 y PASO 3

| Aspecto | PASO 2 – `Ges_Envia_Ventas_Asyncrono` | PASO 3 – `Ges_Localizacion_Dyn` |
|--------|----------------------------------------|---------------------------------|
| **Rol** | Orquestador: ejecuta 4 veces `Ges_EnviaVenta_Dyn` y espera a que terminen los jobs. | Proceso que **actualiza la localización** en Dynamics (PATCH) y pasa documentos de estado 1 → 2. |
| **Cabecera** | No arma cabecera. | No arma cabecera; **usa** `Ges_BlvCabecera`, `Ges_FcvCabecera`, `Ges_NcvCabecera` y `Ges_EstadoEnvioDynamics` para cruzar datos. |
| **Origen de datos** | No consulta tablas de cabecera; solo invoca otro SP. | Obtiene pendientes desde **Dynamics** (Ventas_Pendiente_TI, Nota_Credito_Pendiente_TI), luego cruza con cabeceras locales y `Ges_EstadoEnvioDynamics`. |
| **Estado que usa** | No toca estados; quien actualiza estado es `Ges_EnviaVenta_Dyn`. | Trabaja solo con registros en **estado = 1** (Enviada). |
| **Acción en Dynamics** | Ninguna directa; la hace `Ges_EnviaVenta_Dyn`. | **PATCH** a la API de localización (`LegalSalesDocument`). |
| **Actualización de estado** | No. | Sí: al hacer PATCH correcto pone **Estado = 2** (Actualizada la localización). |

Conclusión: **no se duplica la lógica**. PASO 2 dispara el **envío** (cabecera/detalle a Dynamics, estado 0 → 1). PASO 3 hace solo la **actualización de localización** (estado 1 → 2). Si en algún flujo se hace localización dentro de `Ges_EnviaVenta_Dyn`, entonces habría que revisar ese proc para evitar doble ejecución; en los scripts abiertos, PASO 2 no hace localización.

---

## 3. Revisión del PASO 4 y ventas en estado 0 o 1

### Flujo de estados

- **0** = Sin enviar  
- **1** = Enviada  
- **2** = Actualizada la localización  
- **3** = Registrada  

Secuencia esperada: **0 → (PASO 2 / Ges_EnviaVenta_Dyn) → 1 → (PASO 3) → 2 → (PASO 4) → 3**.

### Por qué hay “muchas ventas sin enviar o en estado 1 o 0”

- **Quedadas en 0:** no fueron procesadas por PASO 2 / `Ges_EnviaVenta_Dyn` (no se ejecutó, falló, o no entraron en el rango de fechas/empresa). Hay que asegurar que PASO 2 (y dentro de él `Ges_EnviaVenta_Dyn`) se ejecute para el `@Cod_Empresa` y `@Fecha` correctos.
- **Quedadas en 1:** ya están enviadas a Dynamics pero **no se ha ejecutado PASO 3** para ellas, o PASO 3 falló para esos documentos. PASO 4 **solo toma documentos en estado 2**, por tanto los que están en 1 nunca se registrarán hasta que PASO 3 los pase a 2.

### Comportamiento del PASO 4 (`Ges_Registra_Venta__Dyn`)

- Obtiene pendientes desde Dynamics (mismo criterio que PASO 3: Ventas_Pendiente_TI, Nota_Credito_Pendiente_TI).
- Cruza con cabeceras locales y **solo con `Ges_EstadoEnvioDynamics` donde `L.estado = 2`** (líneas 254, 275, 300).
- Para cada documento “cuadrado” (diferencia ≤ 9 pesos) hace POST a `salesInvoices` o `salesCreditMemos` y, si responde 200, pone **Estado = 3**.

Por tanto: **si hay muchas en 0 o 1, PASO 4 no las va a registrar** hasta que:
1. Las en 0 pasen por PASO 2 (y queden en 1).  
2. Las en 1 pasen por PASO 3 (y queden en 2).  
3. Luego PASO 4 las llevará a 3.

### Documentos en estado 2 que no pasan a estado 3 (PASO 4)

Si tienes **muchos documentos en estado 2** que no se actualizan a estado 3 al ejecutar PASO 4, las causas más probables son:

| # | Causa | Dónde ocurre | Qué hacer |
|---|--------|----------------|-----------|
| **1** | **GET a Dynamics devuelve 400** (nombre de compañía con espacio) | PASO 4 armaba la URL con `Company('International Sport SA')` sin codificar. BC devuelve 400 y el proc sale con Error 3/4; **#Documentos queda vacío** para esa empresa. | **Aplicado:** Usar nombre de compañía codificado (`REPLACE(@Nombre_Emp, ' ', '%20')`) en las URLs de Ventas_Pendiente_TI y Nota_Credito_Pendiente_TI, igual que en PASO 3. |
| **2** | **Ventana de fecha** | `@Fecha = Isnull( @Fecha , GETDATE()-5 )`. Solo se cruzan documentos con `Convert(date, cab.fecha_emision) >= @Fecha`. Si los estado 2 son de hace más de 5 días, no entran al cruce. | Pasar `@Fecha` más antigua al ejecutar (ej. `GETDATE()-30` o la fecha mínima de tus pendientes en estado 2). |
| **3** | **La API no devuelve esos documentos** | #Documentos se llena **solo** con lo que devuelven las APIs. Si en BC esos documentos ya no están en “pendientes de registrar” (p. ej. ya contabilizados o con otro estado), no aparecen y el JOIN con estado 2 no encuentra nada. | Revisar en BC qué incluyen Ventas_Pendiente_TI / Nota_Credito_Pendiente_TI para “registro” (post) y que coincida con documentos en estado 2. |
| **4** | **Documentos “no cuadrados”** | Solo se hace POST (y Estado = 3) cuando la diferencia entre total local y total Dynamics es **≤ 9 pesos** (`Doc.Estado = 1`). Si la diferencia es mayor, se insertan en #Errores como “NO Cuadrada” y **no se actualizan a 3**. | Revisar #Errores o logs; ajustar el umbral (9) si es demasiado estricto o corregir totales en cabecera/BC. |
| **5** | **POST devuelve distinto de 200/400** | Si el POST a salesInvoices/salesCreditMemos devuelve 401, 404, 500, timeout, etc. (y no el 400 por cantidad insuficiente que se maneja), el documento se mete en #Errores pero **no se actualiza a estado 3**. | Revisar #Errores y Ges_ConsumeAPI; validar token (PASO 4 usa Ges_ObtieneToken_DynAsync) y permisos de la API de registro. |

**Cambios ya aplicados en PASO 4:**

- **URL codificada:** Se declaró `@Nombre_Emp_Encoded = REPLACE(@Nombre_Emp, ' ', '%20')` y se usa en las URLs de los GET a Ventas_Pendiente_TI y Nota_Credito_Pendiente_TI, evitando el 400 por espacio en el nombre de compañía (TL / International Sport SA).
- **Tipo de @Numero:** `@Numero` pasó de `Int` a `Varchar(20)` para evitar errores con formatos de documento (ceros a la izquierda, etc.).
- **Paginación OData:** Los GET a Ventas_Pendiente_TI y Nota_Credito_Pendiente_TI ahora usan un bucle con `$top=500` y `$skip` para traer **todas** las páginas de pendientes que devuelve BC. Sin esto, OData suele devolver solo la primera página (p. ej. 20–100 registros), por lo que con 6000+ documentos en estado 2 solo se procesaban unos cientos por ejecución y el resto quedaban “pegados” en estado 2. Con paginación, una sola ejecución de PASO 4 puede traer y procesar todos los pendientes (en bloques de 500 hasta que no haya más).

### Miles de documentos en estado 2 (6000+): qué hacer

1. **Aplicar el script actualizado de PASO 4** (URL codificada + paginación) en el servidor.
2. **Ejecutar PASO 4 por empresa** con una `@Fecha` que incluya todos los estado 2 (ej. `@Fecha = '20260201'` o `GETDATE()-60`):
   - CISA: `EXEC Ges_Registra_Venta__Dyn @Cod_Empresa = '107BF720-2B02-4A89-8BCF-796CBA00439F', @Fecha = '20260201';`
   - TL: `EXEC Ges_Registra_Venta__Dyn @Cod_Empresa = '466819CB-DCFB-43D4-AE13-E1233D551A47', @Fecha = '20260201';`
   - HIT: `EXEC Ges_Registra_Venta__Dyn @Cod_Empresa = 'FB3A4117-445C-4E4C-8011-D3016530306B', @Fecha = '20260201';`
3. Si usas **ejecución asíncrona** (`@Posicion`, `@Procesos`), cada proceso sigue trayendo todas las páginas de la API; luego el reparto por `@Desde`/`@Hasta` solo afecta qué parte del total se procesa en ese job. Para drenar 6000+ en paralelo, puedes seguir usando 4 procesos; cada uno traerá todos los pendientes y procesará su cuarta parte.
4. **Tiempo:** Con 6000 documentos, el bucle hace muchos GET (p. ej. 12 páginas de 500 para BLE + las de NCV) y luego un POST por documento; puede llevar varios minutos. El token se renueva cada 40 minutos dentro del proc.

### Posible inconsistencia de tipos en PASO 4 (corregida)

- ~~En PASO 4, `@Numero` está declarado como **`Int`** (línea 56) pero en `#Documentos` el campo `Documento` es **`Varchar(20)`** y se asigna a `@Numero` en el bucle (línea 386). Si `Documento` tiene ceros a la izquierda o formato no numérico, puede haber conversión incorrecta o error. Recomendación: declarar `@Numero` como `Varchar(20)` y usarlo como cadena en los `Print` y en el armado de mensajes/cuerpos, o validar que `Documento` sea siempre numérico.~~
- **Corregido:** `@Numero` se declaró como `Varchar(20)` en el script del PASO 4.

---

## 4. Resumen de acciones recomendadas

1. **Cabecera:** Revisar el procedimiento **`Ges_EnviaVenta_Dyn`** (el que invoca PASO 2) para ver cómo se arma la cabecera y confirmar que no se duplica con PASO 3.
2. **Ventas en 0:** Ejecutar PASO 2 (y por tanto `Ges_EnviaVenta_Dyn`) para la empresa y rango de fechas donde hay documentos sin enviar.
3. **Ventas en 1:** Ejecutar **PASO 3** (`Ges_Localizacion_Dyn`) para la misma empresa y fechas; así pasan a estado 2 y PASO 4 podrá registrarlas.
4. **PASO 4:** ~~Corregir el tipo de `@Numero` a `Varchar(20)`~~ **Hecho.** Además, si hay muchos documentos en estado 2 que no pasan a 3: aplicar la misma **codificación de URL** (nombre de compañía con `%20`) en los GET; ya aplicada en el script del PASO 4. Revisar ventana `@Fecha`, que la API devuelva esos documentos y que no queden todos como “NO Cuadrada” (diferencia > 9).
5. **Orden de ejecución:** Para un lote de ventas pendientes, ejecutar en orden: PASO 2 → PASO 3 → PASO 4, con los mismos `@Cod_Empresa` y `@Fecha` (o rangos) que apliquen.
