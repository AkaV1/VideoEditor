package com.example.videoeditor.model

import java.util.UUID

enum class ClipType { VIDEO, IMAGE, TEXT, AUDIO }

/** Propiedades animables. X/Y van de -1 a 1 (fracción de la mitad del lienzo), Y positivo = abajo. */
enum class Prop(val label: String, val min: Float, val max: Float, val default: Float) {
    X("Posición X", -1f, 1f, 0f),
    Y("Posición Y", -1f, 1f, 0f),
    SCALE("Escala", 0.1f, 3f, 1f),
    ROTATION("Rotación", -180f, 180f, 0f),
    OPACITY("Opacidad", 0f, 1f, 1f),
}

/** timeMs es relativo al inicio del clip. */
data class Keyframe(val timeMs: Long, val value: Float)

data class Clip(
    val id: String = UUID.randomUUID().toString(),
    val type: ClipType,
    val uri: String? = null,
    val text: String = "",
    val textColor: Long = 0xFFFFFFFF,
    /** Alto del texto como fracción del alto del lienzo. */
    val textSize: Float = 0.06f,
    val startMs: Long,
    val durationMs: Long,
    val trimStartMs: Long = 0,
    val volume: Float = 1f,
    val base: Map<Prop, Float> = emptyMap(),
    val keyframes: Map<Prop, List<Keyframe>> = emptyMap(),
) {
    val endMs: Long get() = startMs + durationMs

    fun isActiveAt(t: Long) = t >= startMs && t < endMs

    /** Valor de la propiedad en el instante clipTimeMs (relativo al clip), con interpolación lineal. */
    fun valueAt(prop: Prop, clipTimeMs: Long): Float {
        val kfs = keyframes[prop]
        if (kfs.isNullOrEmpty()) return base[prop] ?: prop.default
        if (clipTimeMs <= kfs.first().timeMs) return kfs.first().value
        if (clipTimeMs >= kfs.last().timeMs) return kfs.last().value
        val i = kfs.indexOfLast { it.timeMs <= clipTimeMs }
        val a = kfs[i]
        val b = kfs[i + 1]
        val f = (clipTimeMs - a.timeMs).toFloat() / (b.timeMs - a.timeMs)
        return a.value + (b.value - a.value) * f
    }
}

data class Track(
    val id: String = UUID.randomUUID().toString(),
    val audio: Boolean,
    val clips: List<Clip> = emptyList(),
)

/** Las pistas visuales van de abajo (índice menor) hacia arriba (índice mayor). */
data class Project(
    val tracks: List<Track> = emptyList(),
    val width: Int = 1080,
    val height: Int = 1920,
) {
    val durationMs: Long
        get() = tracks.maxOfOrNull { t -> t.clips.maxOfOrNull { it.endMs } ?: 0L } ?: 0L
}
