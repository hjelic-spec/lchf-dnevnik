package hr.lchf.dnevnik

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.view.View
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Widget za početni zaslon: post (timer, faza, pokretanje), težina, UH danas i brzi unos. */
class PorkiWidget : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { manager.updateAppWidget(it, build(context)) }
    }

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            ACTION_FAST_START -> startFast(context)
            ACTION_TICK -> refreshAll(context)
            ACTION_FAST_GOAL -> {
                val p = prefs(context)
                val start = intent.getLongExtra("start", 0L)
                // Obavijest samo za post pokrenut s widgeta (inače je zakazuje aplikacija)
                if (start > 0 && p.getLong("fastStart", 0L) == start && p.getBoolean("nativeNotify", false)) {
                    p.edit().putBoolean("nativeNotify", false).apply()
                    notifyGoal(context, p.getFloat("fastGoal", 16f))
                }
                refreshAll(context)
            }
            else -> super.onReceive(context, intent)
        }
    }

    companion object {
        const val PREFS = "porki_widget"
        private const val ACTION_FAST_START = "hr.lchf.dnevnik.WIDGET_FAST_START"
        private const val ACTION_FAST_GOAL = "hr.lchf.dnevnik.WIDGET_FAST_GOAL"
        private const val ACTION_TICK = "hr.lchf.dnevnik.WIDGET_TICK"
        private const val CHANNEL = "porki_fast"
        private val HR: Locale = Locale.forLanguageTag("hr-HR")
        private val PHASES = listOf(
            0.0 to "Probava zadnjeg obroka",
            4.0 to "Inzulin pada, troši se glikogen",
            12.0 to "Pojačano sagorijevanje masti i ketoni",
            18.0 to "Duboka ketoza",
            24.0 to "Produženi post – pij vodu i elektrolite"
        )

        private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

        fun refreshAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, PorkiWidget::class.java))
            if (ids.isNotEmpty()) {
                val views = build(context)
                ids.forEach { manager.updateAppWidget(it, views) }
            }
        }

        /** Post pokrenut izravno s widgeta; aplikacija ga preuzme pri sljedećem otvaranju. */
        private fun startFast(context: Context) {
            val p = prefs(context)
            if (p.getLong("fastStart", 0L) > 0L) return refreshAll(context)
            val now = System.currentTimeMillis()
            p.edit().putLong("fastStart", now).putLong("pendingFastStart", now).putBoolean("nativeNotify", true).commit()
            refreshAll(context)
        }

        private fun notifyGoal(context: Context, goal: Float) {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(NotificationChannel(CHANNEL, "Post", NotificationManager.IMPORTANCE_DEFAULT))
            val open = launch(context, "fast", 4)
            val n = NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle("Post je završen")
                .setContentText("Cilj od ${Math.round(goal)} h je ostvaren. Vrijeme za obrok!")
                .setContentIntent(open)
                .setAutoCancel(true)
                .build()
            try { nm.notify(1602, n) } catch (_: SecurityException) { /* nema dozvole za obavijesti */ }
        }

        private fun launch(context: Context, action: String, code: Int): PendingIntent {
            val intent = Intent(context, MainActivity::class.java)
                .setAction("hr.lchf.dnevnik.WIDGET_$action")
                .putExtra("widget_action", action)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            return PendingIntent.getActivity(context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }

        private fun broadcast(context: Context, action: String, code: Int, start: Long = 0L): PendingIntent {
            val intent = Intent(context, PorkiWidget::class.java).setAction(action).putExtra("start", start)
            return PendingIntent.getBroadcast(context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }

        /** Osvježi widget (i po potrebi pošalji obavijest) u trenutku kad je cilj posta ostvaren. */
        private fun scheduleGoal(context: Context, start: Long, goalAt: Long) {
            val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val pi = broadcast(context, ACTION_FAST_GOAL, 10, start)
            if (start <= 0L || goalAt <= System.currentTimeMillis()) { am.cancel(pi); return }
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, goalAt, pi)
        }

        /** Osvježavanje prikaza posta svake minute; nebudeći alarm, pa ne troši bateriju dok je zaslon ugašen. */
        private fun scheduleTick(context: Context, start: Long) {
            val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val pi = broadcast(context, ACTION_TICK, 11)
            if (start <= 0L) { am.cancel(pi); return }
            val now = System.currentTimeMillis()
            val next = start + ((now - start) / 60_000 + 1) * 60_000
            am.setWindow(AlarmManager.RTC, next, 10_000, pi)
        }

        private fun signed(x: Double, dec: Int): String =
            (if (x > 0) "+" else if (x < 0) "−" else "±") + String.format(HR, "%.${dec}f", Math.abs(x))

        private fun shortDay(iso: String): String =
            iso.split("-").let { if (it.size == 3) "${it[2].toInt()}.${it[1].toInt()}." else "" }

        private fun goalLabel(goal: Double): String {
            val g = Math.round(goal).toInt()
            return if (g >= 24 || g <= 0) "$g h" else "$g:${24 - g}"
        }

        private fun hours(ms: Long): String {
            val m = ms / 60000
            return "${m / 60} h ${String.format(HR, "%02d", m % 60)} min"
        }

        private fun whenTxt(t: Long, today: String): String {
            val day = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(t))
            val hm = SimpleDateFormat("HH:mm", HR).format(Date(t))
            return if (day == today) hm else SimpleDateFormat("d.M.", HR).format(Date(t)) + " " + hm
        }

        fun build(context: Context): RemoteViews {
            val p = prefs(context)
            val v = RemoteViews(context.packageName, R.layout.widget_porki)
            val now = System.currentTimeMillis()
            val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(now))

            // Post
            val start = p.getLong("fastStart", 0L)
            val goal = p.getFloat("fastGoal", 16f).toDouble()
            v.setTextViewText(R.id.w_fast_label, "Post ${goalLabel(goal)}")
            if (start > 0 && start <= now) {
                // ciklus: post (crveno) → prozor za jelo (zeleno) → post … dok korisnik ne završi
                val fastMs = (goal * 3600_000).toLong()
                val eatMs = if (goal < 24) ((24 - goal) * 3600_000).toLong() else 0L
                val cycleMs = fastMs + eatMs
                val elapsed = now - start
                val n = if (eatMs > 0) elapsed / cycleMs else 0L
                val cycleStart = start + n * cycleMs
                val eating = eatMs > 0 && now - cycleStart >= fastMs
                val phaseStart = if (eating) cycleStart + fastMs else cycleStart
                val phaseEnd = if (eating) cycleStart + cycleMs else cycleStart + fastMs
                val phaseEl = now - phaseStart
                val phaseMs = if (eating) eatMs else fastMs
                val pct = if (phaseMs > 0) ((phaseEl * 1000) / phaseMs).coerceIn(0, 1000).toInt() else 0
                v.setViewVisibility(R.id.w_clock, View.VISIBLE)
                v.setViewVisibility(R.id.w_fast_off, View.GONE)
                v.setViewVisibility(R.id.w_fast_phase, View.VISIBLE)
                v.setViewVisibility(R.id.w_progress, if (eating) View.GONE else View.VISIBLE)
                v.setViewVisibility(R.id.w_progress_eat, if (eating) View.VISIBLE else View.GONE)
                v.setProgressBar(if (eating) R.id.w_progress_eat else R.id.w_progress, 1000, pct, false)
                val shown = if (eating) phaseEnd - now else phaseEl
                val mins = shown / 60_000
                v.setTextViewText(R.id.w_clock, "${mins / 60} h ${String.format(HR, "%02d", mins % 60)} min")
                v.setTextColor(R.id.w_clock, ContextCompat.getColor(context, if (eating) R.color.w_good else R.color.w_fast))
                v.setTextViewText(R.id.w_fast_label, if (eating) "Jelo, još" else "Post ${goalLabel(goal)}")
                v.setTextViewText(
                    R.id.w_fast_info,
                    when {
                        eating -> "Jelo do ${whenTxt(phaseEnd, today)} · zatim post ${Math.round(goal)} h"
                        eatMs == 0L && phaseEl >= fastMs -> "Cilj ostvaren ${whenTxt(phaseEnd, today)} · +${hours(phaseEl - fastMs)}"
                        eatMs > 0 -> "Post do ${whenTxt(phaseEnd, today)} · zatim jelo ${Math.round(24 - goal)} h"
                        else -> "Početak ${whenTxt(start, today)} · cilj ${whenTxt(phaseEnd, today)}"
                    }
                )
                v.setTextViewText(R.id.w_fast_phase, if (eating) "Prozor za jelo · ${n + 1}. ciklus" else PHASES.last { phaseEl / 3600_000.0 >= it.first }.second)
                v.setTextViewText(R.id.w_fast_btn, "Završi")
                v.setOnClickPendingIntent(R.id.w_fast_btn, launch(context, "fast_end", 5))
                scheduleTick(context, start)
                scheduleGoal(context, start, start + fastMs)
            } else {
                scheduleTick(context, 0L)
                v.setViewVisibility(R.id.w_clock, View.GONE)
                v.setViewVisibility(R.id.w_fast_off, View.VISIBLE)
                v.setViewVisibility(R.id.w_progress, View.GONE)
                v.setViewVisibility(R.id.w_progress_eat, View.GONE)
                v.setViewVisibility(R.id.w_fast_phase, View.GONE)
                v.setTextViewText(R.id.w_fast_info, "Cilj ${Math.round(goal)} h · Započni pokreće post odmah")
                v.setTextViewText(R.id.w_fast_btn, "Započni")
                v.setOnClickPendingIntent(R.id.w_fast_btn, broadcast(context, ACTION_FAST_START, 6))
                scheduleGoal(context, 0L, 0L)
            }

            // Težina i promjena u odnosu na prethodno mjerenje
            val weight = p.getFloat("weight", 0f)
            val color = { id: Int -> ContextCompat.getColor(context, id) }
            if (weight > 0f) {
                v.setTextViewText(R.id.w_weight, String.format(HR, "%.1f kg", weight))
                val wd = p.getString("weightDate", "") ?: ""
                if (p.contains("weightDiff")) {
                    val d = p.getFloat("weightDiff", 0f)
                    val ref = p.getString("weightDiffRef", "") ?: ""
                    val day = if (wd == today) "" else "${shortDay(wd)}: "
                    v.setTextViewText(R.id.w_weight_info, "$day${signed(d.toDouble(), 1)} kg od $ref")
                    v.setTextColor(R.id.w_weight_info, color(if (d < 0f) R.color.w_good else if (d > 0f) R.color.w_bad else R.color.w_muted))
                } else {
                    v.setTextViewText(R.id.w_weight_info, if (wd == today) "danas" else shortDay(wd))
                    v.setTextColor(R.id.w_weight_info, color(R.color.w_muted))
                }
            } else {
                v.setTextViewText(R.id.w_weight, "– kg")
                v.setTextViewText(R.id.w_weight_info, "još nema mjerenja")
                v.setTextColor(R.id.w_weight_info, color(R.color.w_muted))
            }

            // Očekivana promjena prema kalorijskoj bilanci (7700 kcal ≈ 1 kg masnog tkiva)
            val fresh = p.getString("balDate", "") == today
            val parts = mutableListOf<String>()
            var tone = 0f
            if (fresh && p.contains("balToday")) {
                val bt = p.getFloat("balToday", 0f).toDouble()
                parts += "danas ${signed(bt, 0)} kcal ≈ ${signed(bt / 7700, 2)} kg"
                tone = bt.toFloat()
            }
            if (fresh && p.contains("balWeek")) {
                val bw = p.getFloat("balWeek", 0f).toDouble()
                parts += "${p.getInt("balWeekDays", 7)} d ≈ ${signed(bw / 7700, 2)} kg"
                tone = bw.toFloat()
            }
            if (parts.isEmpty()) {
                v.setTextViewText(R.id.w_balance, "Bilanca: unesi hranu i potrošnju")
                v.setTextColor(R.id.w_balance, color(R.color.w_muted))
            } else {
                v.setTextViewText(R.id.w_balance, "Bilanca " + parts.joinToString(" · "))
                v.setTextColor(R.id.w_balance, color(if (tone < 0f) R.color.w_good else if (tone > 0f) R.color.w_bad else R.color.w_muted))
            }

            // Neto UH danas (crveno iznad limita)
            val carbs = if (p.getString("carbDate", "") == today) p.getFloat("carbs", 0f) else 0f
            val limit = p.getFloat("carbLimit", 25f)
            v.setTextViewText(R.id.w_carbs, String.format(HR, "UH %.0f / %.0f g", carbs, limit))
            v.setTextColor(R.id.w_carbs, ContextCompat.getColor(context, if (carbs > limit) R.color.w_bad else R.color.w_muted))

            v.setOnClickPendingIntent(R.id.w_fast, launch(context, "fast", 1))
            // Ketoni (zadnja trakica) i proteini danas
            val ketText = p.getString("ketText", "") ?: ""
            if (ketText.isNotEmpty()) {
                val kd = p.getString("ketDate", "") ?: ""
                val ago = when (kd) {
                    today -> "danas"
                    SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(now - 86_400_000)) -> "jučer"
                    else -> shortDay(kd)
                }
                val time = p.getString("ketTime", "") ?: ""
                val glu = if (p.getBoolean("gluWarn", false)) " · glukoza!" else ""
                v.setTextViewText(R.id.w_ket, "Ketoni $ketText · ${if (kd == today && time.isNotEmpty()) time else ago}$glu")
                v.setTextColor(R.id.w_ket, color(if (glu.isNotEmpty()) R.color.w_bad else R.color.w_ink))
                v.setViewVisibility(R.id.w_ket_dot, View.VISIBLE)
                v.setInt(R.id.w_ket_dot, "setColorFilter", p.getInt("ketColor", 0xFFEFE3C9.toInt()))
            } else {
                v.setViewVisibility(R.id.w_ket_dot, View.GONE)
                v.setTextViewText(R.id.w_ket, "Ketoni: još nema mjerenja")
                v.setTextColor(R.id.w_ket, color(R.color.w_muted))
            }
            val prot = if (p.getString("carbDate", "") == today) p.getFloat("protein", 0f) else 0f
            val protTarget = p.getFloat("proteinTarget", 0f)
            v.setTextViewText(R.id.w_protein, if (protTarget > 0f) String.format(HR, "P %.0f / %.0f g", prot, protTarget) else String.format(HR, "P %.0f g", prot))
            v.setTextColor(R.id.w_protein, color(if (protTarget > 0f && prot >= protTarget) R.color.w_good else R.color.w_muted))

            // Dodiri: težina → unos kg, UH → dodaj hranu, ostalo → aplikacija
            v.setOnClickPendingIntent(R.id.w_weight_row, launch(context, "weight", 2))
            v.setOnClickPendingIntent(R.id.w_carbs, launch(context, "food", 3))
            v.setOnClickPendingIntent(R.id.w_balance, launch(context, "today", 7))
            v.setOnClickPendingIntent(R.id.w_ket_row, launch(context, "ketones", 8))
            return v
        }
    }
}
