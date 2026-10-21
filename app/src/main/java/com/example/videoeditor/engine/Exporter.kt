@file:OptIn(UnstableApi::class)

package com.example.videoeditor.engine

import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.OverlaySettings
import androidx.media3.common.VideoCompositorSettings
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.ChannelMixingAudioProcessor
import androidx.media3.common.audio.ChannelMixingMatrix
import androidx.media3.common.util.Size
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Transformer
import com.example.videoeditor.model.Clip
import com.example.videoeditor.model.ClipType
import com.example.videoeditor.model.Project
import com.example.videoeditor.model.Prop
import com.example.videoeditor.model.Track
import java.io.File

/**
 * Exporta el proyecto con Media3 Transformer.
 *
 * Estrategia: cada pista visual es una secuencia (con huecos); debajo va una secuencia de fondo
 * negro. Un VideoCompositorSettings calcula posición/escala/rotación/opacidad de cada capa en cada
 * fotograma a partir de los keyframes. El texto se rasteriza a un PNG del tamaño del lienzo y se
 * trata como una imagen más. Las pistas de audio se mezclan como secuencias solo de audio.
 */
class Exporter(private val context: Context) {

    fun export(project: Project, onProgress: (Float) -> Unit, onDone: (String) -> Unit) {
        val out = File(context.cacheDir, "export_${System.currentTimeMillis()}.mp4")
        val composition = try {
            build(project)
        } catch (e: Exception) {
            onDone("Error preparando la exportación: ${e.message}")
            return
        }

        val handler = Handler(Looper.getMainLooper())
        val transformer = Transformer.Builder(context)
            .setVideoMimeType(MimeTypes.VIDEO_H264)
            .addListener(object : Transformer.Listener {
                override fun onCompleted(composition: Composition, exportResult: ExportResult) {
                    handler.removeCallbacksAndMessages(null)
                    onDone(saveToGallery(out))
                }

                override fun onError(
                    composition: Composition,
                    exportResult: ExportResult,
                    exportException: ExportException,
                ) {
                    handler.removeCallbacksAndMessages(null)
                    onDone("Error al exportar: ${exportException.message}")
                }
            })
            .build()

        transformer.start(composition, out.absolutePath)

        val holder = ProgressHolder()
        handler.post(object : Runnable {
            override fun run() {
                if (transformer.getProgress(holder) == Transformer.PROGRESS_STATE_AVAILABLE) {
                    onProgress(holder.progress / 100f)
                }
                handler.postDelayed(this, 300)
            }
        })
    }

    // ---------- Composición ----------

    private fun build(project: Project): Composition {
        val w = project.width
        val h = project.height
        val visual = project.tracks.filter { !it.audio && it.clips.isNotEmpty() }
        val audio = project.tracks.filter { it.audio && it.clips.isNotEmpty() }
        val sequences = mutableListOf<EditedMediaItemSequence>()

        if (visual.isNotEmpty()) {
            // Entrada 0: fondo negro por toda la duración.
            val black = EditedMediaItem.Builder(
                MediaItem.Builder()
                    .setUri(Uri.fromFile(renderBlack(w, h)))
                    .setImageDurationMs(project.durationMs)
                    .build()
            )
                .setDurationUs(project.durationMs * 1000)
                .setFrameRate(FPS)
                .setEffects(Effects(emptyList(), listOf(fit(w, h))))
                .build()
            sequences += EditedMediaItemSequence.Builder(black).build()

            for (track in visual) sequences += visualSequence(track, w, h)
        }
        for (track in audio) sequences += audioSequence(track)

        val settings = object : VideoCompositorSettings {
            override fun getOutputSize(inputSizes: List<Size>): Size = Size(w, h)

            override fun getOverlaySettings(inputId: Int, presentationTimeUs: Long): OverlaySettings {
                if (inputId == 0 || inputId - 1 >= visual.size) return OverlaySettings.Builder().build()
                val tMs = presentationTimeUs / 1000
                val clip = visual[inputId - 1].clips.firstOrNull { it.isActiveAt(tMs) }
                    ?: return OverlaySettings.Builder().setAlphaScale(0f).build()
                val rel = tMs - clip.startMs
                val s = clip.valueAt(Prop.SCALE, rel)
                return OverlaySettings.Builder()
                    .setBackgroundFrameAnchor(clip.valueAt(Prop.X, rel), -clip.valueAt(Prop.Y, rel))
                    .setScale(s, s)
                    .setRotationDegrees(-clip.valueAt(Prop.ROTATION, rel))
                    .setAlphaScale(clip.valueAt(Prop.OPACITY, rel))
                    .build()
            }
        }

        return Composition.Builder(sequences)
            .setVideoCompositorSettings(settings)
            .build()
    }

    private fun visualSequence(track: Track, w: Int, h: Int): EditedMediaItemSequence {
        val b = EditedMediaItemSequence.Builder()
        var cursor = 0L
        for (c in track.clips.sortedBy { it.startMs }) {
            if (c.startMs > cursor) b.addGap((c.startMs - cursor) * 1000)
            b.addItem(visualItem(c, w, h))
            cursor = c.endMs
        }
        return b.build()
    }

    private fun visualItem(c: Clip, w: Int, h: Int): EditedMediaItem = when (c.type) {
        ClipType.VIDEO -> {
            val mi = MediaItem.Builder()
                .setUri(c.uri)
                .setClippingConfiguration(
                    MediaItem.ClippingConfiguration.Builder()
                        .setStartPositionMs(c.trimStartMs)
                        .setEndPositionMs(c.trimStartMs + c.durationMs)
                        .build()
                )
                .build()
            EditedMediaItem.Builder(mi)
                .setEffects(Effects(volume(c.volume), listOf(fit(w, h))))
                .build()
        }
        else -> { // IMAGE o TEXT (texto rasterizado)
            val uri = if (c.type == ClipType.TEXT) Uri.fromFile(renderText(c, w, h)) else Uri.parse(c.uri)
            EditedMediaItem.Builder(
                MediaItem.Builder().setUri(uri).setImageDurationMs(c.durationMs).build()
            )
                .setDurationUs(c.durationMs * 1000)
                .setFrameRate(FPS)
                .setEffects(Effects(emptyList(), listOf(fit(w, h))))
                .build()
        }
    }

    private fun audioSequence(track: Track): EditedMediaItemSequence {
        val b = EditedMediaItemSequence.Builder()
        var cursor = 0L
        for (c in track.clips.sortedBy { it.startMs }) {
            if (c.startMs > cursor) b.addGap((c.startMs - cursor) * 1000)
            val mi = MediaItem.Builder()
                .setUri(c.uri)
                .setClippingConfiguration(
                    MediaItem.ClippingConfiguration.Builder()
                        .setStartPositionMs(c.trimStartMs)
                        .setEndPositionMs(c.trimStartMs + c.durationMs)
                        .build()
                )
                .build()
            b.addItem(
                EditedMediaItem.Builder(mi)
                    .setRemoveVideo(true)
                    .setEffects(Effects(volume(c.volume), emptyList()))
                    .build()
            )
            cursor = c.endMs
        }
        return b.build()
    }

    // ---------- Utilidades ----------

    private fun fit(w: Int, h: Int) =
        Presentation.createForWidthAndHeight(w, h, Presentation.LAYOUT_SCALE_TO_FIT_WITH_CROP)

    private fun volume(v: Float): List<AudioProcessor> {
        if (v == 1f) return emptyList()
        val p = ChannelMixingAudioProcessor()
        p.putChannelMixingMatrix(ChannelMixingMatrix.create(1, 2).scaleBy(v))
        p.putChannelMixingMatrix(ChannelMixingMatrix.create(2, 2).scaleBy(v))
        return listOf(p)
    }

    private fun renderBlack(w: Int, h: Int): File {
        val file = File(context.cacheDir, "black_${w}x$h.png")
        if (!file.exists()) {
            val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            bmp.eraseColor(Color.BLACK)
            file.outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
        }
        return file
    }

    /** Texto centrado sobre un PNG transparente del tamaño del lienzo (igual que la vista previa). */
    private fun renderText(c: Clip, w: Int, h: Int): File {
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        val paint = TextPaint(TextPaint.ANTI_ALIAS_FLAG).apply {
            color = c.textColor.toInt()
            textSize = h * c.textSize
            typeface = Typeface.DEFAULT_BOLD
        }
        val maxW = (w * 0.9f).toInt()
        val text = c.text.ifEmpty { " " }
        val layout = StaticLayout.Builder.obtain(text, 0, text.length, paint, maxW)
            .setAlignment(Layout.Alignment.ALIGN_CENTER)
            .build()
        canvas.translate((w - maxW) / 2f, (h - layout.height) / 2f)
        layout.draw(canvas)
        val file = File(context.cacheDir, "text_${c.id}_${text.hashCode()}_${c.textColor}_${c.textSize}.png")
        file.outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
        return file
    }

    private fun saveToGallery(file: File): String {
        val name = "VideoEditor_${System.currentTimeMillis()}.mp4"
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            // Android 9 o menos: carpeta propia de la app (no requiere permisos)
            val dir = context.getExternalFilesDir(Environment.DIRECTORY_MOVIES) ?: context.filesDir
            val dest = File(dir, name)
            file.copyTo(dest, overwrite = true)
            file.delete()
            return "Video guardado en: ${dest.absolutePath}"
        }
        val values = ContentValues().apply {
            put(MediaStore.Video.Media.DISPLAY_NAME, name)
            put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
            put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/VideoEditor")
        }
        val uri = context.contentResolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values)
            ?: return "Exportado, pero no se pudo guardar en la galería: ${file.absolutePath}"
        context.contentResolver.openOutputStream(uri)?.use { o -> file.inputStream().use { it.copyTo(o) } }
        file.delete()
        return "Video guardado en Películas/VideoEditor"
    }

    private companion object {
        const val FPS = 30
    }
}
