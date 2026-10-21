package com.example.videoeditor

import android.app.Application
import android.media.MediaMetadataRetriever
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.videoeditor.engine.Exporter
import com.example.videoeditor.model.Clip
import com.example.videoeditor.model.ClipType
import com.example.videoeditor.model.Keyframe
import com.example.videoeditor.model.Project
import com.example.videoeditor.model.Prop
import com.example.videoeditor.model.Track
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.math.abs

class EditorViewModel(app: Application) : AndroidViewModel(app) {

    var project by mutableStateOf(Project(tracks = listOf(Track(audio = false))))
        private set
    var playheadMs by mutableLongStateOf(0L)
        private set
    var isPlaying by mutableStateOf(false)
        private set
    var selectedId by mutableStateOf<String?>(null)
        private set

    var exporting by mutableStateOf(false)
        private set
    var exportMessage by mutableStateOf<String?>(null)
        private set
    var exportProgress by mutableFloatStateOf(0f)
        private set

    val selected: Clip?
        get() = project.tracks.asSequence().flatMap { it.clips }.firstOrNull { it.id == selectedId }

    // ---------- Añadir ----------

    fun addMedia(uri: Uri, type: ClipType) {
        val duration = if (type == ClipType.IMAGE) 4000L else probeDurationMs(uri)
        place(Clip(type = type, uri = uri.toString(), startMs = playheadMs, durationMs = duration))
    }

    fun addText() {
        place(Clip(type = ClipType.TEXT, text = "Texto", startMs = playheadMs, durationMs = 3000))
    }

    private fun probeDurationMs(uri: Uri): Long {
        val r = MediaMetadataRetriever()
        return try {
            r.setDataSource(getApplication<Application>(), uri)
            r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 5000L
        } catch (e: Exception) {
            5000L
        } finally {
            r.release()
        }
    }

    /** Pone el clip en la primera pista compatible sin solapamiento; si no hay, crea una capa nueva. */
    private fun place(clip: Clip) {
        val wantAudio = clip.type == ClipType.AUDIO
        val idx = project.tracks.indexOfFirst { t ->
            t.audio == wantAudio && t.clips.none { it.startMs < clip.endMs && clip.startMs < it.endMs }
        }
        val tracks = if (idx >= 0) {
            project.tracks.toMutableList().also { it[idx] = it[idx].copy(clips = it[idx].clips + clip) }
        } else {
            project.tracks + Track(audio = wantAudio, clips = listOf(clip))
        }
        project = project.copy(tracks = tracks)
        selectedId = clip.id
    }

    // ---------- Edición ----------

    private fun updateClip(id: String, f: (Clip) -> Clip) {
        project = project.copy(tracks = project.tracks.map { t ->
            if (t.clips.any { it.id == id }) t.copy(clips = t.clips.map { if (it.id == id) f(it) else it }) else t
        })
    }

    fun select(id: String?) {
        selectedId = id
    }

    fun setText(text: String) {
        val c = selected ?: return
        updateClip(c.id) { it.copy(text = text) }
    }

    fun setTextColor(color: Long) {
        val c = selected ?: return
        updateClip(c.id) { it.copy(textColor = color) }
    }

    fun setTextSize(size: Float) {
        val c = selected ?: return
        updateClip(c.id) { it.copy(textSize = size) }
    }

    fun setVolume(v: Float) {
        val c = selected ?: return
        updateClip(c.id) { it.copy(volume = v) }
    }

    fun setDuration(ms: Long) {
        val c = selected ?: return
        val track = project.tracks.first { t -> t.clips.any { it.id == c.id } }
        val maxDur = track.clips.filter { it.startMs >= c.endMs }.minOfOrNull { it.startMs - c.startMs } ?: Long.MAX_VALUE
        updateClip(c.id) { it.copy(durationMs = ms.coerceIn(500L, maxDur.coerceAtLeast(500L))) }
    }

    fun moveBy(id: String, deltaMs: Long) {
        val track = project.tracks.firstOrNull { t -> t.clips.any { it.id == id } } ?: return
        val c = track.clips.first { it.id == id }
        val others = track.clips.filter { it.id != id }
        val minStart = others.filter { it.endMs <= c.startMs }.maxOfOrNull { it.endMs } ?: 0L
        val maxStart = others.filter { it.startMs >= c.endMs }.minOfOrNull { it.startMs - c.durationMs } ?: Long.MAX_VALUE
        val ns = (c.startMs + deltaMs).coerceIn(minStart, maxOf(minStart, maxStart))
        updateClip(id) { it.copy(startMs = ns) }
    }

    fun delete() {
        val c = selected ?: return
        project = project.copy(tracks = project.tracks.map { t -> t.copy(clips = t.clips.filter { it.id != c.id }) })
        selectedId = null
        if (playheadMs > project.durationMs) playheadMs = project.durationMs
    }

    /** Divide el clip seleccionado en la posición del cursor, repartiendo los keyframes. */
    fun split() {
        val c = selected ?: return
        val off = playheadMs - c.startMs
        if (off <= 100 || off >= c.durationMs - 100) return

        val leftKf = c.keyframes.mapValues { (p, l) ->
            l.filter { it.timeMs < off } + Keyframe(off, c.valueAt(p, off))
        }
        val rightKf = c.keyframes.mapValues { (p, l) ->
            listOf(Keyframe(0, c.valueAt(p, off))) +
                l.filter { it.timeMs > off }.map { it.copy(timeMs = it.timeMs - off) }
        }
        val left = c.copy(durationMs = off, keyframes = leftKf)
        val right = c.copy(
            id = java.util.UUID.randomUUID().toString(),
            startMs = playheadMs,
            durationMs = c.durationMs - off,
            trimStartMs = c.trimStartMs + off,
            keyframes = rightKf,
        )
        project = project.copy(tracks = project.tracks.map { t ->
            if (t.clips.any { it.id == c.id }) t.copy(clips = t.clips.flatMap { if (it.id == c.id) listOf(left, right) else listOf(it) }) else t
        })
        selectedId = right.id
    }

    /** dir = +1 sube la capa, -1 la baja (solo entre pistas visuales). */
    fun moveLayer(dir: Int) {
        val c = selected ?: return
        val tracks = project.tracks.toMutableList()
        val i = tracks.indexOfFirst { t -> t.clips.any { it.id == c.id } }
        if (i < 0 || tracks[i].audio) return
        var j = i + dir
        while (j in tracks.indices && tracks[j].audio) j += dir
        if (j !in tracks.indices) return
        val tmp = tracks[i]
        tracks[i] = tracks[j]
        tracks[j] = tmp
        project = project.copy(tracks = tracks)
    }

    // ---------- Propiedades y keyframes ----------

    private fun clipTime(c: Clip) = (playheadMs - c.startMs).coerceIn(0L, c.durationMs)

    private fun upsert(list: List<Keyframe>, kf: Keyframe) =
        (list.filterNot { abs(it.timeMs - kf.timeMs) < 50 } + kf).sortedBy { it.timeMs }

    /** Si la propiedad tiene keyframes, edita/crea el keyframe en el cursor; si no, cambia el valor base. */
    fun setProp(prop: Prop, value: Float) {
        val c = selected ?: return
        val t = clipTime(c)
        updateClip(c.id) { cl ->
            val list = cl.keyframes[prop]
            if (list.isNullOrEmpty()) cl.copy(base = cl.base + (prop to value))
            else cl.copy(keyframes = cl.keyframes + (prop to upsert(list, Keyframe(t, value))))
        }
    }

    fun toggleKeyframe(prop: Prop) {
        val c = selected ?: return
        val t = clipTime(c)
        val value = c.valueAt(prop, t)
        updateClip(c.id) { cl ->
            val list = cl.keyframes[prop].orEmpty()
            if (list.any { abs(it.timeMs - t) < 50 }) {
                val newList = list.filterNot { abs(it.timeMs - t) < 50 }
                if (newList.isEmpty()) cl.copy(keyframes = cl.keyframes - prop, base = cl.base + (prop to value))
                else cl.copy(keyframes = cl.keyframes + (prop to newList))
            } else {
                cl.copy(keyframes = cl.keyframes + (prop to upsert(list, Keyframe(t, value))))
            }
        }
    }

    // ---------- Reproducción ----------

    private var playJob: Job? = null

    fun togglePlay() {
        if (isPlaying) pause() else play()
    }

    private fun play() {
        val total = project.durationMs
        if (total == 0L) return
        if (playheadMs >= total) playheadMs = 0
        isPlaying = true
        playJob = viewModelScope.launch {
            var last = System.nanoTime()
            while (isActive) {
                delay(16)
                val now = System.nanoTime()
                val dtMs = (now - last) / 1_000_000
                last += dtMs * 1_000_000
                playheadMs += dtMs
                if (playheadMs >= project.durationMs) {
                    playheadMs = project.durationMs
                    isPlaying = false
                    break
                }
            }
        }
    }

    fun pause() {
        isPlaying = false
        playJob?.cancel()
    }

    fun seek(ms: Long) {
        playheadMs = ms.coerceIn(0L, project.durationMs)
    }

    // ---------- Exportar ----------

    fun export() {
        if (exporting || project.durationMs == 0L) return
        pause()
        exporting = true
        exportProgress = 0f
        exportMessage = "Exportando…"
        Exporter(getApplication()).export(
            project,
            onProgress = { exportProgress = it },
            onDone = { msg ->
                exporting = false
                exportMessage = msg
            },
        )
    }

    fun dismissExport() {
        if (!exporting) exportMessage = null
    }
}
