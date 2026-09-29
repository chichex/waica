# Coding policies — waica
<!-- Generado por /coding-policies el 2026-09-28. Regenerar con /coding-policies; "Ajustes de este proyecto" se preserva. -->
<!-- coding-policies: generated=2026-09-28; baseline=clean-code@2026-09-14; stacks=typescript@2026-09-14,react@2026-09-14,node@2026-09-14 -->

## Clean Code y SOLID
<!-- coding-policies:baseline=clean-code; version=2026-09-14 -->
### Responsabilidad única y cohesión

- **MUST** Aplicar SRP haciendo que cada función, componente, clase o módulo tenga una sola razón principal para cambiar y responda a un actor o grupo estrechamente relacionado. Porqué: "hacer una sola cosa" sin nombrar quién pide el cambio confunde pasos de una misma responsabilidad con responsabilidades realmente distintas. Gate: `revisión de diseño` que pueda describir responsabilidad y actor en una oración
- **MUST** Mantener juntas las partes que cambian por la misma razón y separar las que cambian por razones distintas. Porqué: SRP busca alta cohesión y bajo acoplamiento, no la mayor cantidad posible de archivos o funciones. Gate: `revisión del diff` y del historial de cambios relacionados
- **MUST** Separar decisiones de dominio, presentación, persistencia e integración cuando tengan actores, ritmos de cambio o contratos distintos; una función de orquestación puede coordinarlas sin implementar todas sus políticas. Porqué: coordinar colaboradores es una responsabilidad válida, mientras absorber sus detalles crea una unidad con múltiples motivos de cambio. Gate: `tests de contratos` en las fronteras identificadas
- **SHOULD** Usar cambios históricos, vocabulario, setup de tests y dependencias como evidencia de responsabilidades mezcladas antes de extraer. Porqué: una división fundada en señales reales conserva mejor la cohesión que una basada únicamente en la forma actual del código. Gate: `git log -- <archivo>` más revisión de imports y fixtures

### Tamaño como señal, no como objetivo

- **MUST** Tratar líneas, complejidad, anidamiento y cantidad de parámetros como detectores de humo, nunca como prueba suficiente de buen o mal diseño. Porqué: una unidad corta puede mezclar responsabilidades y una unidad larga puede ser una tabla declarativa perfectamente cohesionada. Gate: `revisión de responsabilidad y cohesión` junto con las métricas
- **MUST** Medir líneas lógicas con una convención estable que excluya líneas vacías y comentarios, y distinguir código ejecutable de datos o markup declarativo. Porqué: cambiar la forma de contar vuelve incomparables los umbrales y penaliza documentación o formato sin reducir complejidad. Gate: configuración versionada de `ESLint`, `detekt`, `golangci-lint` o herramienta equivalente ya adoptada
- **SHOULD** Considerar hasta 40 líneas lógicas como zona saludable habitual para una función, método o lógica ejecutable de un componente, sin exigir que toda unidad llegue a ese tamaño. Porqué: coincide con el punto de revisión de guías conservadoras y mantiene visible la intención sin promover microfunciones. Gate: `max-lines-per-function`, `LongMethod` o `funlen` configurado como advertencia
- **SHOULD** Tratar entre 41 y 60 líneas lógicas como señal de revisión, no como infracción automática. Porqué: ese rango coincide con defaults comunes de linters, pero todavía puede representar un algoritmo o flujo cohesivo cuya fragmentación empeore la lectura. Gate: `review del PR` asistido por la métrica del stack

### Funciones y métodos

- **MUST** Cuando una función, método o lógica ejecutable de componente tenga más de 60 líneas lógicas, evaluar su responsabilidad, complejidad y posibilidades de extracción; dividirla o documentar por qué mantener cohesión y localidad resulta más claro. Porqué: superar el rango usado por varios linters merece una decisión explícita, no un rechazo mecánico. Gate: `ESLint max-lines-per-function`, `detekt LongMethod` o `golangci-lint funlen` más justificación en el review
- **MUST** Mantener cada función en un nivel de abstracción reconocible y darle un nombre que exprese intención, sin mezclar orquestación de alto nivel con detalles incidentales extensos. Porqué: el lector debe entender primero qué ocurre y profundizar solo donde necesite saber cómo. Gate: `revisión de nombres y flujo` del caller y la función
- **SHOULD** Mantener la complejidad ciclomática en 10 o menos, tratar de 11 a 15 como señal y exigir revisión explícita por encima de 15, eligiendo guard clauses, tablas o extracción solo cuando aclaren el contrato. Porqué: más caminos independientes aumentan combinaciones y costo de prueba, pero reducir el número sin mejorar el modelo solo desplaza la complejidad. Gate: `ESLint complexity`, `detekt CyclomaticComplexMethod` o `golangci-lint cyclop`
- **SHOULD** Mantener el anidamiento en profundidad 3 o menos, tratar profundidad 4 como señal y revisar obligatoriamente cuando supere 4. Porqué: cada nivel agrega contexto simultáneo, aunque extraer bloques triviales puede ocultar el flujo en vez de simplificarlo. Gate: `ESLint max-depth`, `detekt NestedBlockDepth` o equivalente del stack
- **SHOULD** Preferir hasta 3 parámetros, tratar de 4 a 5 como señal y revisar más de 5, sin reemplazarlos mecánicamente por un objeto bolsa con campos no relacionados. Porqué: muchos parámetros suelen revelar responsabilidades o conceptos ausentes, pero agruparlos sin cohesión solo esconde la misma complejidad. Gate: `ESLint max-params`, `detekt LongParameterList` o revisión equivalente

### Componentes y UI

- **MUST** Dar a cada componente una responsabilidad de interfaz identificable y separar regiones que tengan estado, efectos, permisos, ciclos de carga o actores independientes. Porqué: un componente deja de ser cohesivo cuando cambios visuales sin relación pueden romper flujos y dependencias ajenos. Gate: `tests de componente` y revisión del ownership de estado y efectos
- **MUST** Aplicar los umbrales de función a la lógica ejecutable del componente, pero no usar la cantidad de JSX, Compose o markup declarativo como motivo único de extracción. Porqué: el markup puede ser largo y lineal sin agregar caminos ni responsabilidades, mientras pocas líneas con varios efectos pueden ser complejas. Gate: `revisión separada de lógica y markup` más linter del stack
- **SHOULD** Extraer un subcomponente cuando represente una región con nombre de dominio, semántica accesible, contrato de props, comportamiento testeable o reutilización real. Porqué: esas fronteras permiten razonar en aislamiento; cortar fragmentos arbitrarios solo agrega navegación y props. Gate: `tests por comportamiento` y revisión del árbol de componentes
- **MUST** Crear un custom Hook, presenter o componente auxiliar solo cuando encapsule una responsabilidad cohesiva; no mover líneas a un wrapper pasante para cumplir una métrica. Porqué: trasladar código sin reducir conocimiento compartido conserva la complejidad y suma una indirección. Gate: `review del contrato extraído` y de sus dependencias

### Archivos, clases y módulos

- **SHOULD** Considerar hasta 300 líneas lógicas como zona saludable habitual para archivos, clases o módulos escritos a mano. Porqué: coincide con un default extendido de lint y deja espacio para una unidad completa sin convertir cada concepto pequeño en un archivo. Gate: `ESLint max-lines`, `detekt LargeClass` o contador equivalente configurado como advertencia
- **SHOULD** Tratar entre 301 y 600 líneas lógicas como señal para revisar cohesión, superficie pública, dependencias y frecuencia de cambios, no como orden automática de dividir. Porqué: el tamaño intermedio puede indicar responsabilidades acumuladas o simplemente código declarativo que gana claridad al permanecer junto. Gate: `review del PR` con métrica y mapa de exports
- **MUST** Ante más de 600 líneas lógicas escritas a mano, tomar una decisión explícita de descomposición o justificar por qué una unidad cohesionada es más segura; código generado y grandes tablas declarativas se evalúan por su fuente y contrato. Porqué: a esa escala la navegación y el riesgo de mezclar cambios ameritan evidencia, pero una partición artificial también tiene costo. Gate: `revisión de arquitectura` registrada en el PR o excepción versionada del linter
- **MUST** Dividir un archivo o módulo cuando su API pública agrupe conceptos sin relación o cuando cambios de actores distintos lo modifiquen repetidamente, aunque todavía esté debajo del umbral de líneas. Porqué: SRP es una regla de cambio y cohesión, no una recompensa por archivos cortos. Gate: `git log -- <archivo>` más revisión de exports y consumidores

### SOLID sin ceremonia

- **MUST** Aplicar SRP como criterio de cohesión y razón de cambio, no como mandato de que cada unidad ejecute un único paso técnico. Porqué: una operación de negocio puede requerir varios pasos coordinados y seguir respondiendo a un solo actor. Gate: `revisión de responsabilidad` con actor, contrato e invariantes
- **SHOULD** Aplicar OCP creando puntos de extensión solo cuando exista variación observada o exigida por el contrato. Porqué: diseñar para todas las variantes imaginables produce abstracciones especulativas más difíciles de cambiar que el código directo. Gate: `tests de variantes` existentes o requisito que justifique la extensión
- **SHOULD** Aplicar LSP exigiendo que toda implementación sustituible preserve precondiciones, resultados, invariantes, errores y efectos observables del contrato. Porqué: compartir una interfaz o herencia no garantiza que los consumidores puedan reemplazar una implementación sin sorpresas. Gate: `contract tests` ejecutados contra cada implementación
- **SHOULD** Aplicar ISP definiendo interfaces desde las necesidades de sus consumidores y separándolas cuando obliguen a depender de operaciones ajenas. Porqué: contratos amplios aumentan acoplamiento, pero interfaces de un solo método sin consumidores distintos pueden ser ceremonia. Gate: `revisión de consumidores` y fakes de tests
- **SHOULD** Aplicar DIP haciendo que la política de alto nivel dependa de contratos estables e inyectando I/O, tiempo, azar, red y persistencia en sus fronteras volátiles. Porqué: aislar detalles cambiantes mejora pruebas y reemplazo sin invertir cada dependencia interna. Gate: `tests deterministas` con adapters reales cubiertos en integración
- **SHOULD** Evitar una interfaz, factory o capa por cada clase cuando no exista sustitución, frontera volátil ni consumidor que la necesite. Porqué: SOLID reduce acoplamiento útil; aplicado como plantilla multiplica archivos y saltos sin proteger ningún cambio real. Gate: `review de abstracciones` que nombre al menos una variación o frontera concreta

### Extracción sin sobre-split

- **MUST** Nunca extraer una unidad solo para reducir LOC; la extracción debe revelar intención, aislar una responsabilidad, reducir complejidad o establecer un contrato útil. Porqué: satisfacer una cifra sin mejorar comprensión convierte una función larga en una cadena de saltos. Gate: `review del antes y después` con el beneficio nombrado
- **MUST** Dar a toda unidad extraída un nombre específico del dominio o de la intención y entradas, salidas y efectos acotados. Porqué: nombres como `handlePart`, `processData` o `helper` desplazan líneas pero no explican responsabilidades. Gate: `revisión de nombres y firma` más tests del contrato
- **MUST** Preservar localidad cuando varios pasos comparten una invariante, orden o estado y se entienden mejor de forma secuencial. Porqué: dispersar un flujo cohesivo entre muchos archivos obliga al lector a reconstruir contexto sin reducir el conocimiento necesario. Gate: `review de navegación` desde el entry point hasta el resultado
- **SHOULD** Evitar wrappers pasantes, microarchivos y cadenas de funciones de una sola llamada salvo que marquen una frontera estable, mejoren el lenguaje o habiliten sustitución y tests. Porqué: cada indirección tiene costo cognitivo y debe comprar una separación verificable. Gate: `grafo de llamadas` o revisión de callers y contratos

### Adopción y excepciones

- **MUST** Respetar los límites y herramientas que el repositorio ya adoptó y no reconfigurarlos incidentalmente para cerrar una tarea. Porqué: los umbrales son una decisión de equipo y cambiarlos mezcla política global con comportamiento funcional. Gate: `git diff` de configuración de lint y CI
- **SHOULD** En proyectos sin métricas, introducir estos umbrales primero como warnings o revisión sobre código nuevo y endurecerlos solo con una baseline y acuerdo explícitos. Porqué: activar errores globales de una vez genera churn y refactors masivos sin relación con el cambio. Gate: `CI` con baseline o ratchet de archivos modificados
- **MUST** Acotar excepciones de tamaño a código generado, migraciones, fixtures o snapshots extensos, tablas declarativas y adapters mecánicos cuando dividirlos empeore trazabilidad; los tests no quedan exentos por categoría. Porqué: una excepción basada en naturaleza del contenido es revisable, mientras excluir carpetas enteras oculta lógica compleja. Gate: ignore específico en `ESLint`, `detekt`, `golangci-lint` o herramienta equivalente con motivo
- **MUST** Documentar toda supresión con alcance mínimo y razón concreta, y volver a evaluarla cuando cambie la responsabilidad de la unidad. Porqué: una excepción silenciosa se convierte en permiso permanente para acumular complejidad. Gate: `review de suppressions` y configuración versionada

### Lectura ampliada

- [Google C++ Style Guide: Write Short Functions](https://google.github.io/styleguide/cppguide.html#Write_Short_Functions) — recomienda funciones pequeñas y enfocadas, pero rechaza un límite duro y pide no dañar la estructura al dividir.
- [ESLint: max-lines-per-function](https://eslint.org/docs/latest/rules/max-lines-per-function) — regla configurable con default de 50 líneas por función.
- [ESLint: max-lines](https://eslint.org/docs/latest/rules/max-lines) — regla configurable con default de 300 líneas por archivo.
- [ESLint: complexity](https://eslint.org/docs/latest/rules/complexity) — medición configurable de complejidad ciclomática.
- [ESLint: max-depth](https://eslint.org/docs/latest/rules/max-depth) — profundidad máxima configurable, con default 4.
- [ESLint: max-params](https://eslint.org/docs/latest/rules/max-params) — cantidad máxima configurable, con default 3.
- [Detekt: Complexity Rule Set](https://detekt.dev/docs/rules/complexity/) — defaults para métodos largos, clases grandes, parámetros y complejidad en Kotlin.
- [golangci-lint: configuración de linters](https://golangci-lint.run/docs/linters/configuration/#funlen) — defaults de `funlen` y `cyclop` para Go.
- [React: Thinking in React](https://react.dev/learn/thinking-in-react) — separación de componentes por responsabilidad y crecimiento.
- [Martin Fowler: Function Length](https://martinfowler.com/bliki/FunctionLength.html) — extracción guiada por intención frente a implementación, no por una cifra aislada.
- [Refactoring: Extract Function](https://refactoring.com/catalog/extractFunction.html) — mecánica y motivación de una extracción con nombre significativo.
- [Robert C. Martin: The Single Responsibility Principle](https://blog.cleancoder.com/uncle-bob/2014/05/08/SingleReponsibilityPrinciple.html) — razón de cambio, actores, cohesión y separación de responsabilidades.
- [Robert C. Martin: SOLID Relevance](https://blog.cleancoder.com/uncle-bob/2020/10/18/Solid-Relevance.html) — alcance de los cinco principios y su aplicación a diseño y arquitectura.

## TypeScript
<!-- coding-policies:stack=typescript; version=2026-09-14 -->
### Alcance y configuración

- **MUST** Antes de editar, identificar la versión de TypeScript, el gestor y lockfile, los `tsconfig` efectivos, la configuración de lint, los scripts de CI, el runtime de producción y el pipeline de compilación. Porqué: la sintaxis válida y el significado de módulos, paths y emisión dependen del entorno real, no de la versión más nueva de la documentación. Gate: —
- **MUST** Respetar los scripts y convenciones existentes; una corrección acotada no migra módulos, dependencias, formatter, linter ni arquitectura como efecto incidental. Porqué: mezclar una migración con un cambio funcional amplía el riesgo y vuelve ambiguo cualquier fallo. Gate: `git diff -- package.json '*lock*' 'tsconfig*.json'`
- **MUST** Consultar documentación compatible con las versiones instaladas antes de adoptar una API, opción de compilador o preset de lint. Porqué: las páginas vivas pueden documentar capacidades o defaults que el proyecto todavía no tiene. Gate: —
- **MUST** Conservar las comprobaciones existentes y corregir sus errores; no desactivar `strict`, una regla type-aware ni una opción adicional para cerrar la tarea. Porqué: bajar el nivel de verificación convierte el error visible en riesgo silencioso para todo el proyecto. Gate: `tsc --showConfig -p <tsconfig>`
- **SHOULD** En proyectos nuevos, declarar `strict: true` aunque la versión instalada ya lo active por defecto. Porqué: explicita la intención y evita que el contrato dependa de un default histórico del compilador. Gate: `tsc --showConfig -p <tsconfig>`
- **SHOULD** En proyectos nuevos, evaluar y decidir explícitamente `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride` y `noFallthroughCasesInSwitch`; en proyectos existentes, incorporarlos solo mediante un cambio acotado. Porqué: cubren ausencias y contratos que `strict` no modela por completo, pero habilitarlos incidentalmente puede exigir una migración amplia. Gate: `tsc --showConfig -p <tsconfig>`
- **MUST** Ejecutar el typecheck con el proyecto correcto; no pasar archivos sueltos a `tsc` cuando hay un `tsconfig`, y respetar el flujo de project references si existe. Porqué: invocar el compilador fuera del proyecto puede ignorar opciones y producir una señal falsa. Gate: `tsc --noEmit -p <tsconfig>` o el script de typecheck del repo

### Tipos e inferencia

- **SHOULD** Usar inferencia para valores locales obvios y explicitar contratos exportados o fronteras cuando mejore la revisión. Porqué: repetir tipos locales agrega ruido, mientras una API explícita comunica qué estabilidad promete. Gate: `tsc --noEmit -p <tsconfig>`
- **MUST** No usar `as T`, `!` ni una anotación para inventar garantías sobre JSON, red o valores posiblemente ausentes; demostrar el narrowing o validar en runtime. Porqué: las assertions desaparecen al ejecutar y pueden ocultar exactamente el caso que el tipo advertía. Gate: `typescript-eslint` (`no-non-null-assertion` y reglas `no-unsafe-*`)
- **MUST** Representar valores desconocidos con `unknown` y reducirlos antes de operar; no abrir el contrato con `any`. Porqué: `unknown` conserva la obligación de comprobar el valor, mientras `any` propaga operaciones sin verificar. Gate: `typescript-eslint` (`no-explicit-any`, `no-unsafe-assignment`, `no-unsafe-argument`, `no-unsafe-call`, `no-unsafe-member-access`, `no-unsafe-return`)
- **MUST** Si una integración obliga a usar `any`, aislarlo en la frontera mínima y explicar por qué es inevitable; nunca encubrirlo con `as unknown as T`. Porqué: un escape localizado limita la pérdida de seguridad y deja visible la deuda. Gate: `typescript-eslint` (`no-explicit-any`) y revisión de `as unknown as`
- **SHOULD** Elegir `type` o `interface` por sus necesidades de composición y declaration merging, sin conversiones masivas de estilo. Porqué: ambas construcciones son válidas y una preferencia cosmética no justifica churn ni riesgo. Gate: —

### Modelado y narrowing

- **MUST** Modelar estados con datos distintos como uniones discriminadas en vez de grupos de propiedades opcionales independientes. Porqué: el tipo debe permitir solo combinaciones válidas y llevar los datos propios de cada variante. Gate: `tsc --noEmit -p <tsconfig>`
- **MUST** Reducir tipos mediante comprobaciones reales; todo type predicate manual debe implementar y testear la validación que declara. Porqué: la firma de un predicate puede mentirle al compilador aunque su cuerpo acepte valores inválidos. Gate: `tsc --noEmit -p <tsconfig>` y tests del predicate
- **MUST** Tratar las variantes cerradas de forma exhaustiva con `never` o lint; no esconder casos nuevos detrás de un `default` genérico salvo fallback defensivo exigido por datos de runtime. Porqué: agregar una variante debe señalar cada lugar que necesita una decisión. Gate: `typescript-eslint` (`switch-exhaustiveness-check`)
- **SHOULD** Usar `satisfies` para comprobar mapas de configuración y registros conservando sus literales específicos cuando esa inferencia sea útil. Porqué: valida el contrato sin ensanchar innecesariamente el valor como puede hacerlo una anotación. Gate: `tsc --noEmit -p <tsconfig>`

### Genéricos y APIs

- **MUST** Agregar un genérico solo cuando exprese una relación útil entre dos o más posiciones del contrato; evitar parámetros que aparecen una sola vez o no restringen nada. Porqué: un genérico sin relación agrega abstracción sin aportar información al caller. Gate: `typescript-eslint` (`no-unnecessary-type-parameters`)
- **SHOULD** Preferir una unión a overloads cuando ambas expresen el mismo contrato, y evitar restricciones genéricas más fuertes de lo necesario. Porqué: la firma más simple tiene menos casos divergentes entre declaración e implementación. Gate: `typescript-eslint` (`unified-signatures`)
- **MUST** Conservar en el tipo la relación real entre entrada y salida cuando el API la promete; no devolver un union amplio que obligue al caller a reconstruir una correlación conocida. Porqué: perder esa relación desplaza assertions y branches inseguros a todos los consumidores. Gate: `tsc --noEmit -p <tsconfig>`

### Límites y validación

- **MUST** Validar entradas externas relevantes al cruzar el límite del sistema y usar desde allí el valor validado. Porqué: una interfaz TypeScript no comprueba JSON, variables de entorno, storage ni respuestas de red en runtime. Gate: `runner de tests del repo` con entradas válidas e inválidas
- **MUST** Reutilizar el validador ya adoptado por el proyecto; la necesidad de validar no autoriza instalar Zod u otra dependencia por sí sola. Porqué: duplicar mecanismos aumenta bundle, mantenimiento y semánticas de error. Gate: `git diff -- package.json '*lock*'`
- **SHOULD** Derivar tipos desde el esquema cuando la librería lo soporte y distinguir input de output si hay coerciones o transformaciones. Porqué: un contrato duplicado puede driftear y una transformación hace que el tipo recibido no sea el tipo producido. Gate: `tsc --noEmit -p <tsconfig>`
- **MUST** Elegir deliberadamente qué hacer con campos desconocidos y revisar la semántica de toda coerción; no asumir que strings como `"false"` se convierten según intención humana. Porqué: strip, rechazo, passthrough y coerción cambian el contrato y pueden aceptar datos inesperados. Gate: `runner de tests del repo` con campos extra y coerciones

### Promesas y concurrencia

- **MUST** Toda promesa se espera, se retorna al caller o maneja explícitamente su rechazo. Porqué: una promesa flotante pierde errores y puede dejar efectos incompletos fuera del flujo observable. Gate: `typescript-eslint` (`no-floating-promises`)
- **MUST** No considerar `void tarea()` como manejo de errores; si se desprende trabajo, definir dónde se observa y trata el rechazo. Porqué: `void` puede silenciar al linter pero no cambia la semántica de la promesa. Gate: `typescript-eslint` (`no-floating-promises`) con `ignoreVoid: false`, o revisión equivalente
- **MUST** No pasar callbacks `async` a APIs que ignoran su promesa, como `forEach`; usar un loop secuencial o una agregación de promesas según la semántica. Porqué: el caller no espera esos callbacks y sus fallos quedan desacoplados. Gate: `typescript-eslint` (`no-misused-promises`)
- **MUST** Elegir conscientemente entre ejecución secuencial y concurrente, preservar el orden cuando importe y limitar fan-out contra servicios externos. Porqué: `Promise.all` sin criterio puede romper dependencias, saturar recursos o cambiar el comportamiento observable. Gate: `runner de tests del repo` con orden, fallo parcial y límite de concurrencia

### Módulos y runtime

- **MUST** Alinear `module`, `moduleResolution`, `package.json`, extensiones e imports con quien ejecuta o bundlea el JavaScript final. Porqué: que el dev server resuelva un import no demuestra que Node, el bundler o los consumidores de una librería puedan hacerlo. Gate: `tsc` más build o ejecución del artefacto de producción
- **SHOULD** Usar `import type` para dependencias que solo existen en el sistema de tipos, respetando el pipeline y `verbatimModuleSyntax` del proyecto. Porqué: hace explícita la frontera de runtime y evita emisiones o imports ambiguos. Gate: `typescript-eslint` (`consistent-type-imports`) o `tsc --noEmit -p <tsconfig>`
- **SHOULD** Separar `tsconfig` cuando servidor, navegador, workers y tests necesiten globals o emisión distintos. Porqué: una configuración única demasiado amplia permite APIs que no existen en alguno de los runtimes. Gate: `tsc -b` o scripts de typecheck por entorno
- **MUST** Si Node ejecuta TypeScript nativo, mantener un typecheck independiente y no asumir que el type stripping aplica aliases de `paths` ni transformaciones. Porqué: la ejecución nativa borra tipos pero no usa el `tsconfig` para comprobarlos o resolverlos. Gate: `tsc --noEmit -p <tsconfig>` y ejecución con la versión real de Node

### Linting y supresiones

- **SHOULD** Si el repo usa ESLint, partir de `recommendedTypeChecked` y configurar obtención de tipos con `projectService: true` cuando las versiones instaladas lo soporten. Porqué: las reglas type-aware detectan propagación insegura que el lint sintáctico no ve. Gate: `eslint .`
- **MUST** Adoptar `strictTypeChecked` solo deliberadamente y no habilitar el preset `all` automáticamente. Porqué: los presets opinados pueden cambiar fuera de una major y `all` introduce reglas sin una decisión de equipo. Gate: revisión de la configuración de `typescript-eslint` y `eslint .`
- **MUST** Corregir el problema antes de suprimirlo; una excepción usa `@ts-expect-error` con motivo concreto y alcance mínimo, nunca desactiva chequeos globales para cerrar la tarea. Porqué: `@ts-expect-error` falla cuando la excepción deja de ser necesaria y la explicación conserva el contexto. Gate: `typescript-eslint` (`ban-ts-comment`)
- **MUST** Verificar la matriz soportada de TypeScript, ESLint, parser y Node antes de actualizar cualquiera de ellos. Porqué: que el gestor resuelva versiones no significa que la combinación tenga soporte oficial. Gate: lockfile más documentación de compatibilidad de `typescript-eslint`

### Testing y verificación

- **MUST** Ejecutar los scripts pertinentes del repo para typecheck, lint, tests y build; si no hay typecheck y aplica, usar el compilador local con `--noEmit` y el `tsconfig` correcto. Porqué: cada gate cubre defectos distintos y una herramienta global puede no coincidir con el proyecto. Gate: scripts de CI del repo y `tsc --noEmit -p <tsconfig>`
- **MUST** Probar comportamiento observable y casos de error relevantes, especialmente validación, narrowing manual, cancelación y concurrencia cuando cambien. Porqué: que el código compile no demuestra que el contrato de runtime se cumpla. Gate: `runner de tests del repo`
- **MUST** Informar qué verificaciones se ejecutaron y cuáles no; no presentar un build sin typecheck ni una ejecución con type stripping como evidencia de tipos. Porqué: una señal mal etiquetada crea una confianza que la herramienta no produjo. Gate: `reporte final` con comando y resultado

### Rendimiento del tipado

- **SHOULD** Nombrar cálculos de tipos complejos reutilizados y preferir composición legible; evaluar `interface extends` frente a grandes intersecciones de objetos. Porqué: tipos anónimos e intersecciones profundas pueden repetir trabajo y empeorar diagnósticos. Gate: `tsc --noEmit -p <tsconfig>`
- **MUST** Medir antes de refactorizar por rendimiento del sistema de tipos. Porqué: sin diagnóstico se puede añadir complejidad sin atacar el cuello de botella real. Gate: `tsc --extendedDiagnostics -p <tsconfig>` o trace del compilador
- **MUST** No activar `skipLibCheck` automáticamente para ocultar conflictos entre dependencias; investigar el origen y documentar el compromiso si se adopta. Porqué: acelera el chequeo omitiendo errores en declaraciones y reduce la cobertura del compilador. Gate: `tsc --showConfig -p <tsconfig>` y typecheck con la decisión documentada

### Lectura ampliada

- [TypeScript: strict](https://www.typescriptlang.org/tsconfig/strict.html) — familia base de comprobaciones estrictas.
- [TypeScript: noUncheckedIndexedAccess](https://www.typescriptlang.org/tsconfig/noUncheckedIndexedAccess.html) — ausencia posible en accesos indexados.
- [TypeScript: exactOptionalPropertyTypes](https://www.typescriptlang.org/tsconfig/exactOptionalPropertyTypes.html) — diferencia entre propiedad ausente y `undefined` explícito.
- [TypeScript Handbook: Everyday Types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html) — inferencia, annotations, unions y assertions.
- [TypeScript Handbook: Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html) — guards, predicates, uniones discriminadas y exhaustividad.
- [TypeScript Handbook: More on Functions](https://www.typescriptlang.org/docs/handbook/2/functions.html) — genéricos y overloads simples.
- [TypeScript: `satisfies`](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html#the-satisfies-operator) — comprobación sin perder inferencia específica.
- [typescript-eslint: typed linting](https://typescript-eslint.io/getting-started/typed-linting/) — configuración de reglas con información de tipos.
- [typescript-eslint: shared configs](https://typescript-eslint.io/users/configs/) — alcance y estabilidad de los presets.
- [typescript-eslint: avoiding `any`](https://typescript-eslint.io/blog/avoiding-anys/) — reglas que limitan `any` explícito y propagado.
- [typescript-eslint: no-floating-promises](https://typescript-eslint.io/rules/no-floating-promises/) — promesas cuyo resultado no se observa.
- [typescript-eslint: no-misused-promises](https://typescript-eslint.io/rules/no-misused-promises/) — promesas en posiciones que esperan valores síncronos.
- [typescript-eslint: switch-exhaustiveness-check](https://typescript-eslint.io/rules/switch-exhaustiveness-check/) — exhaustividad type-aware.
- [TypeScript: choosing compiler options for modules](https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options.html) — configuración según Node, bundler o librería.
- [TypeScript: verbatimModuleSyntax](https://www.typescriptlang.org/tsconfig/verbatimModuleSyntax.html) — relación explícita entre imports y emisión.
- [Node.js: Modules TypeScript](https://nodejs.org/api/typescript.html) — capacidades y límites de ejecutar TypeScript nativo.
- [TypeScript: erasableSyntaxOnly](https://www.typescriptlang.org/tsconfig/erasableSyntaxOnly.html) — sintaxis compatible con borrado de tipos.
- [Zod: Basic usage](https://zod.dev/basics) — validación de entradas y derivación de tipos cuando el repo usa Zod.
- [TypeScript Performance](https://github.com/microsoft/TypeScript/wiki/Performance) — diagnóstico y diseño de tipos con mejor desempeño.
- [TypeScript: skipLibCheck](https://www.typescriptlang.org/tsconfig/skipLibCheck.html) — alcance y pérdida de cobertura de la opción.
- [TypeScript 6.0 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html) — cambios de defaults y deprecaciones que requieren revisar versiones.

## React
<!-- coding-policies:stack=react; version=2026-09-14 -->
### Pureza y Hooks

- **MUST** Mantener puro el render: la misma combinación de props, estado y contexto produce el mismo JSX y no ejecuta efectos secundarios. Porqué: React puede renderizar, pausar o repetir trabajo antes de confirmar una actualización. Gate: `eslint-plugin-react-hooks` y tests de comportamiento
- **MUST** No mutar props, estado ni valores recibidos por Hooks. Porqué: React trata esos valores como snapshots y la mutación rompe detección de cambios y razonamiento entre renders. Gate: `reglas de inmutabilidad del linter o revisión del diff`
- **MUST** Usar componentes mediante JSX en vez de invocarlos como funciones ordinarias. Porqué: React necesita controlar su identidad, Hooks y lifecycle dentro del árbol. Gate: `eslint-plugin-react-hooks` más tests de render
- **MUST** Llamar Hooks ordinarios en el nivel superior de componentes o custom Hooks; la API `use` puede admitir condiciones o loops, pero sigue dentro de un componente o Hook y fuera de `try`/`catch`. Porqué: el orden estable asocia cada llamada con su estado y las excepciones de `use` no se extienden a `useState` o `useEffect`. Gate: `eslint-plugin-react-hooks` (`rules-of-hooks`)
- **MUST** Conservar las reglas recomendadas de `eslint-plugin-react-hooks` compatibles con la versión instalada y no desactivarlas para cerrar la tarea. Porqué: codifican invariantes de React que el typecheck no observa. Gate: `eslint .`

### Estado y reducers

- **MUST** Mantener el estado mínimo y evitar guardar valores que pueden calcularse desde props y estado durante render. Porqué: dos fuentes de verdad se desincronizan y agregan Effects innecesarios. Gate: revisión de `useState` y `useReducer`
- **SHOULD** Guardar la identidad seleccionada cuando el objeto completo ya vive en otra colección. Porqué: conservar una copia del objeto permite que quede obsoleta respecto de la fuente. Gate: `tests de actualización de la colección`
- **MUST** No copiar props a estado salvo que representen deliberadamente un valor inicial y el nombre haga explícita esa semántica. Porqué: el estado copiado deja de seguir cambios del parent sin que el contrato lo diga. Gate: `tests de cambio de props`
- **MUST** Modelar variantes de estado de modo que no permitan combinaciones contradictorias, usando discriminantes cuando cada estado tenga datos distintos. Porqué: booleans y campos opcionales independientes permiten loading, éxito y error al mismo tiempo. Gate: `typecheck y tests de transiciones`
- **SHOULD** Introducir un reducer cuando reúna transiciones complejas o dispersas; sus acciones describen eventos y su implementación permanece pura, mientras casos simples siguen con `useState`. Porqué: el reducer sirve para hacer comprensible un flujo, no como ceremonia universal. Gate: `tests de transiciones del reducer`

### Effects

- **MUST** Usar Effects para sincronizar con sistemas externos, no como mecanismo general de flujo interno. Porqué: un Effect agrega un ciclo posterior al render y puede ejecutarse más veces de las imaginadas. Gate: revisión de cada `useEffect`
- **MUST** Calcular datos derivados durante render y ejecutar interacciones desde sus event handlers, sin Effects que copien listas filtradas, encadenen estado o disparen una compra. Porqué: el lugar causal directo evita renders extra y acciones que ocurren por haber pintado UI. Gate: `tests de interacción y revisión de Effects`
- **SHOULD** Para datos remotos, preferir el mecanismo del framework o la solución existente que gestione cache, deduplicación y concurrencia. Porqué: un fetch manual en un Effect suele reimplementar lifecycle y carreras de red. Gate: `revisión de la capa de datos del repo`
- **MUST** Limpiar simétricamente suscripciones, conexiones y timers creados por un Effect; ante requests manuales, cancelar o ignorar respuestas obsoletas. Porqué: setup → cleanup → setup debe funcionar sin leaks ni resultados fuera de orden. Gate: `tests de cleanup y respuestas tardías`
- **MUST** Declarar como dependencias todos los valores reactivos leídos y no suprimir `exhaustive-deps` para imponer un array vacío. Porqué: una dependencia falsa deja closures viejos y esconde un diseño de sincronización incorrecto. Gate: `eslint-plugin-react-hooks` (`exhaustive-deps`)
- **SHOULD** Si la versión lo soporta, usar `useEffectEvent` solo para lógica no reactiva disparada desde Effects; no usarlo para ocultar dependencias, pasarlo a otros componentes ni llamarlo desde handlers ordinarios. Porqué: separa lecturas recientes de la sincronización sin convertirlo en un escape del modelo reactivo. Gate: `eslint-plugin-react-hooks` y tests del Effect
- **MUST** Corregir los problemas que revela Strict Mode antes de plantear desactivarlo. Porqué: la repetición de setup y cleanup expone Effects no idempotentes que también fallan en navegación real. Gate: tests bajo `StrictMode` o entorno de desarrollo equivalente

### Identidad y componentes

- **MUST** Usar `key` cuando una nueva identidad del dominio deba reiniciar el estado de un subárbol. Porqué: React preserva estado por tipo y posición; una key comunica que ya no es la misma entidad. Gate: `test de cambio de identidad`
- **MUST** No declarar componentes dentro de otros componentes si deben conservar identidad entre renders. Porqué: cada render crea un tipo distinto y React desmonta su estado. Gate: `lint de componentes anidados o revisión del árbol`
- **SHOULD** Mantener el estado en el ancestro común más cercano que realmente coordina a sus consumidores, sin elevarlo por defecto a un store global. Porqué: ownership local reduce acoplamiento y renders ajenos. Gate: `profiler y revisión del flujo de datos`

### Memoización

- **MUST** Comprobar si React Compiler está habilitado antes de diseñar optimizaciones manuales nuevas. Porqué: una versión moderna de React no demuestra que el compilador esté configurado para ese código. Gate: configuración y diagnóstico de `React Compiler`
- **SHOULD** Agregar `useMemo`, `useCallback` o `memo` solo por una necesidad concreta y medible. Porqué: también agregan dependencias y complejidad, y pueden costar más que el cálculo evitado. Gate: `profiler antes y después`
- **MUST** No retirar memoización existente en bloque sin comprobar comportamiento y rendimiento. Porqué: puede formar parte de un contrato de identidad o proteger un hotspot no evidente. Gate: `suite del repo y perfilado del flujo afectado`
- **MUST** No tratar React Compiler ni `useMemo` como una caché general para funciones, red o datos persistentes. Porqué: su alcance es la optimización de componentes y Hooks, no la semántica de almacenamiento de la aplicación. Gate: `revisión de ownership y lifetime de la caché`

### Testing y accesibilidad

- **MUST** Probar resultados observables mediante texto, roles e interacción en vez de estado interno o detalles privados. Porqué: el test debe describir el contrato del usuario y sobrevivir refactors legítimos. Gate: `runner de tests del repo con queries accesibles`
- **MUST** Cubrir los estados de carga, vacío, error, éxito y reintento que cambie el flujo. Porqué: el happy path no verifica cómo se recupera la interfaz ante respuestas normales del sistema. Gate: `tests de componentes o integración`
- **MUST** Usar elementos y atributos semánticos para que teclado y tecnologías asistivas puedan operar los controles. Porqué: un handler de click sobre un elemento visual no hereda rol, foco ni activación de teclado. Gate: `linter de accesibilidad y tests por rol`
- **MUST** No actualizar snapshots sin revisar su significado ni usarlos como única prueba de una interacción. Porqué: aceptar el diff mecánicamente no demuestra que el comportamiento sea correcto. Gate: `revisión de snapshots más assertions observables`

### Verificación

- **MUST** Ejecutar lint, typecheck, tests y build mediante los scripts existentes del repo. Porqué: Hooks, tipos, comportamiento y bundling fallan por mecanismos distintos. Gate: scripts de CI declarados en `package.json`
- **MUST** Para cambios de interfaz, verificar navegación, foco, estados async y comportamiento accesible en el entorno que integra React. Porqué: un test unitario no ejecuta necesariamente routing, CSS, plataforma ni lector de pantalla. Gate: `tests de integración o prueba humana definida por el proyecto`
- **MUST** Informar versiones relevantes, comandos ejecutados y flujos visuales o accesibles que quedaron sin probar. Porqué: la evidencia debe distinguir comprobación automática de validación pendiente. Gate: `reporte final` con comando y resultado

### Lectura ampliada

- [Rules of React](https://react.dev/reference/rules) — pureza, inmutabilidad y responsabilidades del render.
- [eslint-plugin-react-hooks](https://react.dev/reference/eslint-plugin-react-hooks) — reglas recomendadas y diagnósticos del compilador.
- [Rules of Hooks](https://react.dev/reference/eslint-plugin-react-hooks/lints/rules-of-hooks) — orden de Hooks y caso especial de `use`.
- [Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure) — estado mínimo y fuentes de verdad.
- [Extracting State Logic into a Reducer](https://react.dev/learn/extracting-state-logic-into-a-reducer) — cuándo reunir transiciones.
- [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) — derivados, eventos y sincronización externa.
- [Synchronizing with Effects](https://react.dev/learn/synchronizing-with-effects) — setup, cleanup y lifecycle.
- [Removing Effect Dependencies](https://react.dev/learn/removing-effect-dependencies) — dependencias reactivas sin supresiones.
- [Preserving and Resetting State](https://react.dev/learn/preserving-and-resetting-state) — posición, tipo y keys.
- [React Compiler: Introduction](https://react.dev/learn/react-compiler/introduction) — memoización automática y alcance.
- [useEffectEvent](https://react.dev/reference/react/useEffectEvent) — separar lógica no reactiva sin ocultar dependencias.

## Node.js
<!-- coding-policies:stack=node; version=2026-09-14 -->
### Alcance y versiones

- **MUST** Antes de editar, identificar la versión de Node de producción, si el proceso es servicio, worker, CLI o función administrada, el gestor y lockfile, los scripts y el supervisor. Porqué: lifecycle, APIs disponibles y señales operativas dependen del runtime y del dueño real del proceso. Gate: —
- **SHOULD** Usar una rama Active LTS o Maintenance LTS en producción y revalidar su estado al actualizar, sin convertir una versión concreta en recomendación eterna. Porqué: soporte y seguridad cambian con el calendario oficial de releases. Gate: `node --version` más tabla oficial de releases
- **MUST** Conservar el gestor y lockfile del proyecto; con npm usar `npm ci` en automatización y el mecanismo equivalente si el repo eligió otro gestor. Porqué: una instalación reproducible debe fallar ante drift en vez de reescribir dependencias silenciosamente. Gate: `npm ci` o comando congelado del gestor declarado
- **MUST** No cambiar versión de Node, gestor, módulos ni dependencias como efecto incidental de una corrección acotada. Porqué: esas migraciones alteran resolución, artefactos y despliegue más allá del comportamiento pedido. Gate: `git diff -- package.json '*lock*' '.nvmrc' '.node-version'`

### Event loop y CPU

- **MUST** Mantener acotado el trabajo síncrono por request o tarea y evitar APIs sync costosas dentro de handlers. Porqué: un callback que bloquea el event loop retrasa a todos los clientes del proceso. Gate: `profiling bajo una carga representativa`
- **MUST** Limitar tamaño y complejidad de entradas antes de parsear, recorrer o aplicar expresiones regulares potencialmente patológicas. Porqué: una entrada no confiable puede monopolizar CPU o memoria aunque la operación parezca pequeña en casos normales. Gate: `tests de límites y timeout bajo entradas adversas`
- **MUST** No asumir que declarar una función `async` vuelve paralelo el cálculo síncrono que ejecuta. Porqué: el JavaScript CPU-bound sigue corriendo en el mismo event loop hasta que cede. Gate: `profiler de CPU y event-loop delay`
- **SHOULD** Para CPU intensiva, evaluar partición o un pool reutilizado de workers con límites; no crear un worker por operación ni usarlos como solución habitual para I/O asíncrono. Porqué: startup, clonación y coordinación tienen costo, mientras Node ya delega gran parte del I/O. Gate: `benchmark antes/después y prueba de saturación del pool`

### Timeouts y cancelación

- **MUST** Definir plazos para operaciones externas y usar `AbortSignal` cuando la API soporte cancelación, combinando timeout y señal del caller con `AbortSignal.any` cuando corresponda. Porqué: sin deadline o propagación una dependencia colgada retiene memoria, sockets y capacidad de concurrencia indefinidamente. Gate: tests de timeout con `AbortSignal.timeout()` o mecanismo equivalente
- **MUST** Propagar la señal hasta el consumidor real y comprobar que éste la utilice. Porqué: aceptar un parámetro sin conectarlo a la operación crea una cancelación aparente que no libera trabajo. Gate: `test que observe aborto en la dependencia`
- **MUST** No presentar `Promise.race` con un timer como cancelación de la promesa perdedora. Porqué: el caller puede recibir timeout mientras la operación real continúa consumiendo recursos y produciendo efectos. Gate: `test de cleanup posterior al timeout`
- **MUST** Definir límites de concurrencia según el servicio y manejar el rechazo de toda tarea iniciada. Porqué: fan-out sin tope satura la dependencia y una promesa huérfana convierte el fallo en rechazo no observado. Gate: `tests de concurrencia máxima y fallo parcial`

### Streams y backpressure

- **SHOULD** Usar streams cuando el volumen vuelva riesgoso cargar el payload completo en memoria. Porqué: procesar por chunks acota memoria y permite empezar antes, siempre que se respete backpressure. Gate: `prueba con payload mayor al límite operativo esperado`
- **MUST** Respetar backpressure y preferir `pipeline` para coordinar errores y finalización entre streams. Porqué: ignorar el valor de `write` o encadenar eventos a mano puede acumular memoria y perder fallos. Gate: `node:stream/promises` (`pipeline`) o test equivalente de backpressure
- **MUST** Propagar `AbortSignal` cuando una transferencia deba cancelarse y cerrar los recursos asociados. Porqué: cortar solo la espera del caller deja la fuente, destino o socket activos. Gate: `test de aborto y cierre de handles`
- **MUST** Revisar qué respuesta queda posible después de fallar un pipeline HTTP. Porqué: `pipeline` puede destruir streams y cerrar el socket, por lo que ya no siempre se puede enviar un JSON de error. Gate: `test de fallo durante transmisión sobre el servidor real`

### Errores

- **MUST** Manejar rechazos y eventos `error` según el contrato específico de la API usada. Porqué: Promises, EventEmitters, callbacks y streams propagan fallos por canales distintos. Gate: `tests de cada camino de error observable`
- **MUST** Para errores de Node, decidir por códigos documentados y no por texto de `message`. Porqué: el mensaje puede cambiar entre versiones, plataformas o locale sin alterar la condición. Gate: revisión de comparaciones contra `error.code`
- **SHOULD** Envolver con `cause` al agregar contexto útil y conservar el error original. Porqué: el caller necesita tanto la operación que falló como la causa para clasificar y diagnosticar. Gate: tests de `error.cause`
- **MUST** Distinguir errores esperables de una operación de fallos que invalidan el estado del proceso. Porqué: reintentar un input inválido y continuar después de corrupción requieren decisiones opuestas. Gate: `tabla o tests de clasificación en la frontera`

### Lifecycle

- **MUST** En servicios cuyo ciclo controla la aplicación, detener nuevas conexiones, esperar trabajo en curso con un plazo y cerrar recursos durante shutdown. Porqué: terminar abruptamente pierde requests y un cierre sin deadline puede no acabar nunca. Gate: `test de señal y shutdown con trabajo en vuelo`
- **MUST** No instalar handlers de proceso indiscriminadamente cuando un framework o plataforma serverless sea dueño del lifecycle. Porqué: competir con el host puede duplicar cleanup, impedir suspensión o cortar invocaciones ajenas. Gate: `documentación del runtime y prueba de integración`
- **MUST** No continuar operando normalmente después de `uncaughtException`; realizar solo la limpieza segura necesaria y dejar que supervisión externa reinicie. Porqué: el proceso puede haber quedado en un estado inconsistente que no se puede reparar genéricamente. Gate: `test aislado de proceso hijo y configuración del supervisor`
- **MUST** No usar `process.exit()` durante el cierre normal antes de drenar trabajo y salida pendientes. Porqué: fuerza la terminación y puede truncar logs, respuestas o escrituras. Gate: `test de proceso hijo que verifica salida y cleanup`

### Seguridad

- **MUST** Configurar límites y timeouts de HTTP, bodies y operaciones acordes al contrato del servicio. Porqué: Node no limita automáticamente todo el trabajo que ejecutan parsers y handlers sobre entradas no confiables. Gate: `tests de payload excedido, request lento y timeout`
- **MUST** No fusionar JSON externo indiscriminadamente en objetos de configuración o prototipos compartidos. Porqué: claves controladas por el cliente pueden sobrescribir política interna o habilitar prototype pollution. Gate: `tests con claves peligrosas y análisis de seguridad del repo`
- **MUST** Conservar lockfiles, revisar dependencias y ejecutar la comprobación de vulnerabilidades adoptada por el proyecto. Porqué: cada paquete amplía la cadena de suministro y requiere una versión reproducible para investigar hallazgos. Gate: `npm audit` o scanner configurado en CI
- **MUST** No exponer errores internos, secretos ni detalles de sockets al cliente; mapear una respuesta pública estable en la frontera. Porqué: los diagnósticos operativos contienen datos que no forman parte del contrato externo. Gate: `tests de respuestas de error y revisión de logs`

### Contexto y testing

- **SHOULD** Reutilizar la solución de observabilidad existente; si hace falta contexto por request, usar `AsyncLocalStorage` en vez de una variable global mutable. Porqué: las operaciones concurrentes no pueden compartir de forma segura una única identidad actual. Gate: `test con requests intercaladas`
- **SHOULD** Preferir `AsyncLocalStorage.run` a `enterWith` salvo una razón concreta y acotar el store a los datos necesarios. Porqué: `run` delimita mejor el lifetime y reduce contaminación entre callbacks. Gate: `tests de propagación y aislamiento de contexto`
- **MUST** Usar el runner ya adoptado, esperar operaciones y subtests, liberar recursos y restaurar mocks. Porqué: handles abiertos y trabajo no esperado producen flakes o falsos verdes después de que el test termina. Gate: `runner del repo con detección de handles o cleanup`
- **MUST** Verificar resultados y errores observables, especialmente cancelación, concurrencia y autorización cuando cambien. Porqué: testear detalles internos no demuestra el contrato del proceso ante fallos reales. Gate: `tests de integración en límites del sistema`

### Verificación

- **MUST** Ejecutar lint, typecheck si aplica, tests y build o packaging mediante los scripts del repo. Porqué: el runtime puede ejecutar código que todavía incumple tipos, estilo o forma de despliegue. Gate: scripts de CI declarados en `package.json`
- **SHOULD** Medir event-loop delay, CPU y memoria bajo una carga representativa cuando el cambio afecte rendimiento o concurrencia. Porqué: un microbenchmark aislado no muestra saturación ni interacción entre requests. Gate: `profiler y prueba de carga del proyecto`
- **MUST** Informar la versión de Node usada, los comandos ejecutados y cualquier lifecycle o carga que quedó sin verificar. Porqué: resultados de una rama o modo local no prueban automáticamente el runtime de producción. Gate: `reporte final` con versión, comando y resultado

### Lectura ampliada

- [Node.js Releases](https://nodejs.org/en/about/previous-releases) — calendario de soporte y ramas LTS.
- [npm: `npm ci`](https://docs.npmjs.com/cli/commands/npm-ci/) — instalación reproducible desde lockfile.
- [Node.js: Don't Block the Event Loop](https://nodejs.org/learn/asynchronous-work/dont-block-the-event-loop) — trabajo acotado, CPU y entradas adversas.
- [Node.js: Worker threads](https://nodejs.org/api/worker_threads.html) — paralelismo CPU y pools.
- [Node.js: AbortController and AbortSignal](https://nodejs.org/api/globals.html#class-abortcontroller) — cancelación y composición de señales.
- [Node.js: Streams](https://nodejs.org/api/stream.html) — backpressure, pipeline y abort.
- [Node.js: Errors](https://nodejs.org/api/errors.html) — códigos, propagación y `cause`.
- [Node.js: Process](https://nodejs.org/api/process.html) — señales, excepciones fatales y terminación.
- [Node.js: HTTP server close](https://nodejs.org/api/http.html#serverclosecallback) — cierre de conexiones.
- [Node.js Security Best Practices](https://nodejs.org/learn/getting-started/security-best-practices) — límites, dependencias y entradas no confiables.
- [Node.js: AsyncLocalStorage](https://nodejs.org/api/async_context.html) — contexto por operación asíncrona.
- [Node.js: Test runner](https://nodejs.org/api/test.html) — subtests, mocks y cleanup.

## Ajustes de este proyecto
<!-- coding-policies:ajustes:start -->
Decided in the 2026-09-28 compliance grill (`.sdd/grills/2026-09-28-coding-policies-compliance.md`, issue #100). The policy text above stays in Spanish; these adjustments are written in English like the rest of the repository.

- **Language.** Code, comments, UI strings, tests, docs and commit messages are written in English. This convention lives here instead of `CLAUDE.md`.
- **Enforcement.** Every MUST rule whose gate names a lint rule runs at `error` in `pnpm lint` (ESLint flat config in `packages/lint`); every SHOULD rule runs at `warn` and is held to `packages/lint/lint-baseline.json` by a per-file, per-rule ratchet: a change may remove warnings but never add them. `packages/lint/README.md` maps each policy line to its rule and severity.
- **Thresholds.** Logical lines skip blank lines and comments. Error tier: 60 per function (L23), 600 per file (L40). Warn tier: 40 per function (L18), 300 per file (L38), complexity 10 (L25), depth 3 (L26), 3 parameters (L27).
- **Tests.** Size and complexity rules are warn-only in test code: `*.test.ts(x)` plus the two scripted harnesses `scripts/runtime-e2e.mjs` and `scripts/test-*.mjs`. Type, promise and suppression rules keep their production severity in tests.
- **Preset rules.** `recommendedTypeChecked` rules that no policy line names are adopted through L138 (a SHOULD) and run at `warn` under the ratchet; rules a MUST line names run at `error`.
- **Lint TypeScript.** ESLint's type-aware rules run on a lint-only `typescript@6.0.3` in `packages/lint`, because TypeScript 7 has no JavaScript compiler API and `typescript-eslint` supports `<6.1.0`; builds and `pnpm typecheck` stay on TypeScript 7.
- **`exactOptionalPropertyTypes` (L91): declined.** Distinguishing an absent property from an explicit `undefined` changes the public engine types (component params, scene JSON, runtime options) across every package; that migration is a separate, deliberate change, not part of compliance.
- **React Compiler (L215): not enabled.** The build plugin is not configured and there is no plan to enable it here; its diagnostics run through `eslint-plugin-react-hooks` (purity, refs, immutability, static components and the rest of the recommended preset). Existing manual memoization stays (L217).
- **`noImplicitOverride` and `noFallthroughCasesInSwitch` (L91): enabled** in `tsconfig.base.json` for every workspace project.
- **`skipLibCheck` (L153): kept, with the reason in `tsconfig.base.json`.** tsc 7.0.2 does not finish checking the declarations of `@types/three` 0.185.1 (a file importing only `three` was still running after 90 s; the engine after 636 s), while tsc 6.0.3 checks the same declarations with zero errors in 3 s. No third-party type is wrong; remove the option once tsc 7 checks them.
- **Node tsconfig (L133).** `tsconfig.node.json` (lib `ES2022`, no DOM) is the base for `packages/cli` and `packages/lint`; the `cli` and `mcp` builds use `module`/`moduleResolution` `NodeNext`, and `mcp` declares the `?raw` modules its tests need instead of including the editor's declarations. `packages/mcp` keeps the DOM lib: its program compiles the engine, archetype and editor sources it imports (workspace exports point at `src/`) and the `page.evaluate` callbacks that run in the browser, and `lib` is program-wide.
- **Ratchet across splits (CA-4).** When a file is split, SHOULD warnings may move with the code into the new files. The baseline is regenerated after such a change and holds two conditions, checked in the issue #100 run: no pre-existing file-and-rule entry grows, and no rule's repository-wide total grows. New code carries no warning it did not move.
- **Size suppressions (L23, L40, L64).** None: every function is at most 60 logical lines and every file at most 600, including `runEntry` and `createGridPlayerRole`, which were split instead of suppressed. The remaining suppressions are four `jsx-a11y/no-autofocus` (focus moves into a field the user just opened) and, in tests, two `prefer-promise-reject-errors` and the phantom type parameter of the type-equality check, each with its reason inline; `asSchedulingClass` in `packages/mcp/src/project-component-loader.ts` keeps the only documented `as unknown as`.
<!-- coding-policies:ajustes:end -->
