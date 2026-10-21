package com.example.videoeditor.engine

import android.content.Context
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.ui.unit.IntSize
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.VideoSize
import androidx.media3.exoplayer.ExoPlayer
import com.example.videoeditor.model.ClipType
import com.example.videoeditor.model.Project
import kotlin.math.abs

/**
 * Vista previa: un ExoPlayer por cada clip de video/audio cercano al cursor.
 * El reloj maestro es el cursor del ViewModel; los players se sincronizan a él.
 */
class PreviewEngine(private val context: Context) {

    val players = mutableStateMapOf<String, ExoPlayer>()
    val videoSizes = mutableStateMapOf<String, IntSize>()

    fun sync(project: Project, playheadMs: Long, playing: Boolean) {
        val wanted = HashSet<String>()
        for (track in project.tracks) for (c in track.clips) {
            if (c.type != ClipType.VIDEO && c.type != ClipType.AUDIO) continue
            if (playheadMs < c.startMs - PRELOAD_MS || playheadMs >= c.endMs) continue
            wanted += c.id
            val p = players[c.id] ?: create(c.id, c.uri!!)
            val active = c.isActiveAt(playheadMs)
            val expected = c.trimStartMs + (playheadMs - c.startMs).coerceAtLeast(0L)
            p.volume = c.volume
            if (active) {
                val tolerance = if (playing) 250 else 40
                if (abs(p.currentPosition - expected) > tolerance) p.seekTo(expected)
                p.playWhenReady = playing
            } else {
                p.playWhenReady = false
                if (abs(p.currentPosition - c.trimStartMs) > 40) p.seekTo(c.trimStartMs)
            }
        }
        for (id in players.keys.toList()) {
            if (id !in wanted) {
                players.remove(id)?.release()
                videoSizes.remove(id)
            }
        }
    }

    private fun create(id: String, uri: String): ExoPlayer {
        val p = ExoPlayer.Builder(context).build()
        p.addListener(object : Player.Listener {
            override fun onVideoSizeChanged(videoSize: VideoSize) {
                if (videoSize.width > 0 && videoSize.height > 0) {
                    videoSizes[id] = IntSize(videoSize.width, videoSize.height)
                }
            }
        })
        p.setMediaItem(MediaItem.fromUri(uri))
        p.prepare()
        players[id] = p
        return p
    }

    fun releaseAll() {
        players.values.forEach { it.release() }
        players.clear()
        videoSizes.clear()
    }

    private companion object {
        const val PRELOAD_MS = 500L
    }
}
