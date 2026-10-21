# Editor de Video (Android, Kotlin + Jetpack Compose + Media3)

## Cómo abrirlo
1. Abre la carpeta `VideoEditor` en Android Studio (Ladybug o más nuevo, JDK 17).
2. Deja que sincronice Gradle (genera el wrapper solo).
3. Ejecuta en un teléfono o emulador con Android 7.0+ (minSdk 24).

## Funciones
- **Video, imagen y audio**: botones inferiores. Se colocan en el cursor; si se solapan con otro clip, se crea una capa nueva.
- **Texto**: editable, con color y tamaño.
- **Capas**: cada pista visual es una capa. Botones ⬆/⬇ en el inspector cambian el orden.
- **Línea de tiempo**: toca la regla para mover el cursor, arrastra un clip para moverlo, +/− para zoom.
- **Dividir / borrar** el clip seleccionado en la posición del cursor.
- **Keyframes**: posición X/Y, escala, rotación y opacidad. Pulsa ◇ en una propiedad para crear un keyframe en el cursor; con keyframes, mover el slider edita el keyframe del instante actual. Interpolación lineal.
- **Volumen** por clip de video y audio.
- **Exportar** MP4 (H.264) a Películas/VideoEditor con Media3 Transformer.

## Estructura
- `model/Models.kt`: Clip, Track, Project, Keyframe y la interpolación.
- `EditorViewModel.kt`: todas las acciones de edición y el reloj de reproducción.
- `engine/PreviewEngine.kt`: un ExoPlayer por clip activo, sincronizado al cursor.
- `engine/Exporter.kt`: arma la `Composition` (fondo negro + una secuencia por capa + secuencias de audio) y aplica los keyframes por fotograma con `VideoCompositorSettings`.
- `ui/EditorScreen.kt`: vista previa, línea de tiempo e inspector.

## Limitaciones conocidas
- No se compiló aquí (sin SDK de Android): puede haber ajustes menores de API de Media3 1.6.x.
- Sin deshacer/rehacer, sin recorte arrastrando bordes (usa dividir + borrar), sin transiciones.
- Una capa con videos e imágenes mezclados puede dar problemas de audio al exportar.
- Las URIs de los medios son temporales: no se guarda el proyecto entre sesiones.
