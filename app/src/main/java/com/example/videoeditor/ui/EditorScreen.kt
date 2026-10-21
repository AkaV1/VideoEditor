package com.example.videoeditor.ui

import android.view.TextureView
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import com.example.videoeditor.EditorViewModel
import com.example.videoeditor.engine.PreviewEngine
import com.example.videoeditor.model.Clip
import com.example.videoeditor.model.ClipType
import com.example.videoeditor.model.Prop
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.roundToInt

private val PanelBg = Color(0xFF1B1B1B)

@Composable
fun EditorScreen(vm: EditorViewModel = viewModel()) {
    val context = LocalContext.current
    val engine = remember { PreviewEngine(context) }
    var zoom by remember { mutableFloatStateOf(70f) } // dp por segundo

    DisposableEffect(Unit) { onDispose { engine.releaseAll() } }
    LaunchedEffect(Unit) {
        snapshotFlow { Triple(vm.project, vm.playheadMs, vm.isPlaying) }
            .collect { (p, t, playing) -> engine.sync(p, t, playing) }
    }

    val pickVideo = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        uri?.let { vm.addMedia(it, ClipType.VIDEO) }
    }
    val pickImage = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        uri?.let { vm.addMedia(it, ClipType.IMAGE) }
    }
    val pickAudio = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let { vm.addMedia(it, ClipType.AUDIO) }
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(Color(0xFF0E0E0E))
            .statusBarsPadding()
            .navigationBarsPadding()
    ) {
        // Barra superior
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Editor de Video", color = Color.White, fontWeight = FontWeight.Bold)
            Button(onClick = { vm.export() }, enabled = !vm.exporting) { Text("Exportar") }
        }

        // Vista previa
        Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
            Preview(vm, engine, Modifier.fillMaxHeight())
        }

        // Transporte
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            TextButton(onClick = { vm.togglePlay() }) { Text(if (vm.isPlaying) "⏸ Pausa" else "▶ Reproducir") }
            Text("${fmt(vm.playheadMs)} / ${fmt(vm.project.durationMs)}", color = Color.White, fontSize = 13.sp)
            Row {
                TextButton(onClick = { zoom = (zoom * 0.7f).coerceAtLeast(20f) }) { Text("−") }
                TextButton(onClick = { zoom = (zoom * 1.4f).coerceAtMost(300f) }) { Text("+") }
            }
        }

        Timeline(vm, zoom, Modifier.fillMaxWidth().height(150.dp))

        vm.selected?.let { clip ->
            Inspector(vm, clip, Modifier.fillMaxWidth().heightIn(max = 210.dp))
        }

        // Barra inferior: añadir
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 4.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            TextButton(onClick = {
                pickVideo.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.VideoOnly))
            }) { Text("🎬 Video") }
            TextButton(onClick = {
                pickImage.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
            }) { Text("🖼 Imagen") }
            TextButton(onClick = { vm.addText() }) { Text("🔤 Texto") }
            TextButton(onClick = { pickAudio.launch("audio/*") }) { Text("🎵 Audio") }
        }
    }

    vm.exportMessage?.let { msg ->
        AlertDialog(
            onDismissRequest = { vm.dismissExport() },
            title = { Text("Exportar") },
            text = {
                Column {
                    Text(msg)
                    if (vm.exporting) {
                        LinearProgressIndicator(progress = { vm.exportProgress }, modifier = Modifier.fillMaxWidth().padding(top = 12.dp))
                    }
                }
            },
            confirmButton = {
                if (!vm.exporting) TextButton(onClick = { vm.dismissExport() }) { Text("OK") }
            },
        )
    }
}

private fun fmt(ms: Long): String {
    val s = ms / 1000f
    return "%02d:%04.1f".format((s / 60).toInt(), s % 60)
}

// ============================ Vista previa ============================

@Composable
private fun Preview(vm: EditorViewModel, engine: PreviewEngine, modifier: Modifier = Modifier) {
    val p = vm.project
    val ph = vm.playheadMs
    BoxWithConstraints(
        modifier
            .aspectRatio(p.width.toFloat() / p.height, matchHeightConstraintsFirst = true)
            .background(Color.Black)
            .clipToBounds()
    ) {
        val density = LocalDensity.current
        val wPx = with(density) { maxWidth.toPx() }
        val hPx = with(density) { maxHeight.toPx() }
        p.tracks.filter { !it.audio }.forEach { track ->
            track.clips.filter { it.isActiveAt(ph) }.forEach { clip ->
                key(clip.id) { Layer(clip, ph - clip.startMs, wPx, hPx, engine) }
            }
        }
    }
}

@Composable
private fun Layer(clip: Clip, t: Long, wPx: Float, hPx: Float, engine: PreviewEngine) {
    val density = LocalDensity.current
    val tx = clip.valueAt(Prop.X, t) * wPx / 2
    val ty = clip.valueAt(Prop.Y, t) * hPx / 2
    val s = clip.valueAt(Prop.SCALE, t)
    val rot = clip.valueAt(Prop.ROTATION, t)
    val op = clip.valueAt(Prop.OPACITY, t)
    val xf = Modifier
        .fillMaxSize()
        .graphicsLayer {
            translationX = tx
            translationY = ty
            scaleX = s
            scaleY = s
            rotationZ = rot
            alpha = op
        }

    when (clip.type) {
        ClipType.VIDEO -> {
            val player = engine.players[clip.id]
            val vs = engine.videoSizes[clip.id]
            if (player != null && vs != null) {
                val aspect = vs.width.toFloat() / vs.height
                val canvasAspect = wPx / hPx
                // "Cover": rellena el lienzo recortando lo que sobre
                val w = if (aspect > canvasAspect) hPx * aspect else wPx
                val h = if (aspect > canvasAspect) hPx else wPx / aspect
                Box(xf.clipToBounds(), contentAlignment = Alignment.Center) {
                    AndroidView(
                        factory = { TextureView(it) },
                        update = { player.setVideoTextureView(it) },
                        modifier = Modifier.requiredSize(
                            with(density) { w.toDp() },
                            with(density) { h.toDp() },
                        ),
                    )
                }
            }
        }
        ClipType.IMAGE -> AsyncImage(
            model = clip.uri,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = xf,
        )
        ClipType.TEXT -> Box(xf, contentAlignment = Alignment.Center) {
            Text(
                clip.text,
                color = Color(clip.textColor),
                fontSize = with(density) { (hPx * clip.textSize).toSp() },
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(0.9f),
            )
        }
        ClipType.AUDIO -> Unit
    }
}

// ============================ Línea de tiempo ============================

private fun clipColor(type: ClipType) = when (type) {
    ClipType.VIDEO -> Color(0xFF3B6EA5)
    ClipType.IMAGE -> Color(0xFF2E8B57)
    ClipType.TEXT -> Color(0xFFB8860B)
    ClipType.AUDIO -> Color(0xFF8E44AD)
}

private fun clipLabel(c: Clip) = when (c.type) {
    ClipType.VIDEO -> "Video"
    ClipType.IMAGE -> "Imagen"
    ClipType.TEXT -> c.text
    ClipType.AUDIO -> "Audio"
}

@Composable
private fun Timeline(vm: EditorViewModel, zoomDpPerSec: Float, modifier: Modifier = Modifier) {
    val density = LocalDensity.current
    val pxPerMs = with(density) { zoomDpPerSec.dp.toPx() } / 1000f
    val totalMs = max(vm.project.durationMs + 4000L, 8000L)
    val scroll = rememberScrollState()
    val visual = vm.project.tracks.filter { !it.audio }.reversed() // capa superior arriba
    val audio = vm.project.tracks.filter { it.audio }

    Box(modifier.background(PanelBg).horizontalScroll(scroll)) {
        Column(Modifier.width(with(density) { (totalMs * pxPerMs).toDp() })) {
            // Regla: toca o arrastra para mover el cursor
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(24.dp)
                    .background(Color(0xFF2A2A2A))
                    .pointerInput(pxPerMs) {
                        detectTapGestures { vm.seek((it.x / pxPerMs).toLong()) }
                    }
                    .pointerInput(pxPerMs) {
                        detectDragGestures { change, _ ->
                            change.consume()
                            vm.seek((change.position.x / pxPerMs).toLong())
                        }
                    }
            ) {
                val step = if (zoomDpPerSec < 40f) 2 else 1
                for (sec in 0..(totalMs / 1000).toInt() step step) {
                    Text(
                        "${sec}s",
                        color = Color.Gray,
                        fontSize = 9.sp,
                        modifier = Modifier.offset { IntOffset((sec * 1000 * pxPerMs).roundToInt() + 2, 2) },
                    )
                }
            }
            Column(Modifier.verticalScroll(rememberScrollState())) {
                (visual + audio).forEach { track ->
                    Box(Modifier.fillMaxWidth().height(46.dp).padding(vertical = 2.dp)) {
                        track.clips.forEach { clip -> key(clip.id) { ClipBlock(vm, clip, pxPerMs) } }
                    }
                }
            }
        }
        // Cursor
        Box(
            Modifier
                .offset { IntOffset((vm.playheadMs * pxPerMs).roundToInt(), 0) }
                .width(2.dp)
                .fillMaxHeight()
                .background(Color.Red)
        )
    }
}

@Composable
private fun ClipBlock(vm: EditorViewModel, clip: Clip, pxPerMs: Float) {
    val density = LocalDensity.current
    val selected = vm.selectedId == clip.id
    Box(
        Modifier
            .offset { IntOffset((clip.startMs * pxPerMs).roundToInt(), 0) }
            .width(with(density) { (clip.durationMs * pxPerMs).toDp() })
            .fillMaxHeight()
            .background(clipColor(clip.type), RoundedCornerShape(6.dp))
            .then(if (selected) Modifier.border(2.dp, Color.White, RoundedCornerShape(6.dp)) else Modifier)
            .clickable { vm.select(clip.id) }
            .pointerInput(clip.id, pxPerMs) {
                detectDragGestures(onDragStart = { vm.select(clip.id) }) { change, drag ->
                    change.consume()
                    vm.moveBy(clip.id, (drag.x / pxPerMs).toLong())
                }
            }
            .drawBehind {
                // Rombos de keyframes
                clip.keyframes.values.flatten().forEach { kf ->
                    val cx = kf.timeMs * pxPerMs
                    val cy = size.height - 8.dp.toPx()
                    val r = 4.dp.toPx()
                    val path = Path().apply {
                        moveTo(cx, cy - r); lineTo(cx + r, cy); lineTo(cx, cy + r); lineTo(cx - r, cy); close()
                    }
                    drawPath(path, Color.Yellow)
                }
            }
    ) {
        Text(
            clipLabel(clip),
            color = Color.White,
            fontSize = 11.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp),
        )
    }
}

// ============================ Inspector ============================

private val TextColors = listOf(0xFFFFFFFF, 0xFFFFEB3B, 0xFFFF5252, 0xFF40C4FF, 0xFF69F0AE, 0xFF000000)

@Composable
private fun Inspector(vm: EditorViewModel, clip: Clip, modifier: Modifier = Modifier) {
    val t = (vm.playheadMs - clip.startMs).coerceIn(0L, clip.durationMs)
    val visual = clip.type != ClipType.AUDIO

    Column(modifier.background(PanelBg).verticalScroll(rememberScrollState()).padding(horizontal = 8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            TextButton(onClick = { vm.split() }) { Text("✂ Dividir") }
            TextButton(onClick = { vm.delete() }) { Text("🗑 Borrar") }
            if (visual) {
                TextButton(onClick = { vm.moveLayer(+1) }) { Text("⬆ Capa") }
                TextButton(onClick = { vm.moveLayer(-1) }) { Text("⬇ Capa") }
            }
        }

        if (clip.type == ClipType.TEXT) {
            OutlinedTextField(
                value = clip.text,
                onValueChange = { vm.setText(it) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = false,
                maxLines = 3,
            )
            Row(Modifier.padding(vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextColors.forEach { c ->
                    Box(
                        Modifier
                            .size(28.dp)
                            .background(Color(c), CircleShape)
                            .border(if (clip.textColor == c) 3.dp else 1.dp, Color.Gray, CircleShape)
                            .clickable { vm.setTextColor(c) }
                    )
                }
            }
            LabeledSlider("Tamaño", clip.textSize, 0.02f..0.2f) { vm.setTextSize(it) }
        }

        if (clip.type == ClipType.IMAGE || clip.type == ClipType.TEXT) {
            LabeledSlider("Duración", clip.durationMs / 1000f, 0.5f..30f) { vm.setDuration((it * 1000).toLong()) }
        }
        if (clip.type == ClipType.VIDEO || clip.type == ClipType.AUDIO) {
            LabeledSlider("Volumen", clip.volume, 0f..2f) { vm.setVolume(it) }
        }

        if (visual) {
            Prop.values().forEach { prop ->
                val hasKf = clip.keyframes[prop]?.any { abs(it.timeMs - t) < 50 } == true
                val animated = !clip.keyframes[prop].isNullOrEmpty()
                Row(verticalAlignment = Alignment.CenterVertically) {
                    TextButton(onClick = { vm.toggleKeyframe(prop) }) {
                        Text(if (hasKf) "◆" else "◇", color = if (animated) Color.Yellow else Color.Gray)
                    }
                    Text(prop.label, color = Color.White, fontSize = 12.sp, modifier = Modifier.width(76.dp))
                    Slider(
                        value = clip.valueAt(prop, t).coerceIn(prop.min, prop.max),
                        onValueChange = { vm.setProp(prop, it) },
                        valueRange = prop.min..prop.max,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

@Composable
private fun LabeledSlider(
    label: String,
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    onChange: (Float) -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = Color.White, fontSize = 12.sp, modifier = Modifier.width(84.dp).padding(start = 12.dp))
        Slider(
            value = value.coerceIn(range.start, range.endInclusive),
            onValueChange = onChange,
            valueRange = range,
            modifier = Modifier.weight(1f),
        )
    }
}
