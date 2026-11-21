# Respuestas por voz con Soniox

## Alcance aprobado

Cada adivinador puede activar voluntariamente su propio micrófono y responder en español durante el turno. El teclado permanece disponible en paralelo. Nunca se activa por entrar, reconectar o cambiar de turno. Soniox recibe audio a través del servidor de Tabú; la validación y el puntaje siguen siendo autoridad del servidor.

## Estado

- Implementado en `feat/soniox-voice`, sobre la base `cb2acf3`. Consultar el historial Git y el PR para el estado de publicación; no se realizó ningún deploy.
- Preservados los archivos locales de adopción del workflow previos a esta feature.
- Captura PCM mono mediante AudioWorklet; proxy Socket.IO con validación de identidad, rol, turno, plazo y aparición de carta, límites de concurrencia y flujo de audio.
- Un enunciado final constituye un intento. Las capturas se rotan al cambiar de carta sin pedir otro gesto dentro del mismo turno; se invalidan los callbacks/audio anteriores.
- El micrófono se libera al apagarlo, desconectar, cambiar de turno/rol, salir o desmontar; se descartan permisos que llegan después de cancelar.
- La clave maestra no forma parte del contrato del cliente. No se persiste audio ni transcripciones descartadas.

## Configuración

El servidor requiere `SONIOX_API_KEY` y `SONIOX_VOICE_ENABLED=true`. La bandera está apagada por defecto en código y en el ejemplo. La configuración local ignorada por Git quedó habilitada, sin cambiar ni mostrar la clave existente. Un proceso de aplicación ya abierto debe reiniciarse para cargar cambios de entorno. En despliegues, configurar ambas variables en el entorno del servidor. El micrófono requiere HTTPS o localhost; HTTP desde una IP LAN no es equivalente a localhost.

## Evidencia observada

- Suite completa: 86 archivos pasaron y 3 quedaron omitidos; 1068 tests pasaron, 46 de Mongo omitidos por falta de entorno de pruebas dedicado. Comando del ejecutor: `env -u MONGODB_URI_TEST pnpm --config.verify-deps-before-run=never test --maxWorkers=4 --reporter=dot`.
- `pnpm typecheck`: pasó.
- `pnpm lint`: cero errores; warning preexistente por importación `act` sin usar en `src/ui/screens/game/describing-view.test.tsx`.
- `pnpm build`: pasó con Mongo de prueba inaccesible y voz deshabilitada únicamente en el entorno del comando de compilación; no se usaron servicios de datos reales.
- Formato aplicado solamente a archivos de código modificados para la feature; los 6 tests focalizados de voz volvieron a pasar después del formato.
- Soniox real autorizado: audio sintético en español reconocido como «Elefante.». Prueba integrada independiente: PCM -> Socket.IO -> proxy real -> Soniox -> validación del juego -> un punto y una sola publicación. En la misma captura activa se aceptó un intento escrito incorrecto sin bloquear el teclado.
- Revisión independiente del código: sin defectos de seguridad ni lógica bloqueantes. Sugerencias no bloqueantes: ampliar regresiones de la misma carta repetida en modo puntos, reemplazo de socket, cancelación durante rotación y límites de captura/audio.
- UI revisada mediante el flujo OpenCode/review-ui en escritorio y viewport móvil con proveedor simulado y micrófono físico bloqueado: visibilidad por turno, aviso Soniox y teclado tras permiso denegado. No equivale a prueba física de micrófono en todos los navegadores ni a una llamada positiva Soniox desde navegador real.

## Documentación y archivos principales

`README.md`, `.env.example`, `server.ts`, `src/infrastructure/config/env.ts`, contratos y servidor Socket.IO, `src/infrastructure/voice/`, `public/voice-capture.js`, integración de GameScreen/GuessChat, `voice-guess.tsx` y sus pruebas.

## Pendientes no bloqueantes

- Probar físicamente con varios jugadores en los navegadores y dispositivos finales; evaluar ruido, eco y voces cercanas. El reconocimiento no identifica de forma infalible quién habló cerca de un micrófono.
- Configurar la bandera y la clave en el entorno de despliegue, si se decide publicar. Esta implementación no autoriza deploy ni cambios en Mongo.
- Ampliar las regresiones sugeridas por revisión cuando se continúe el mantenimiento.
