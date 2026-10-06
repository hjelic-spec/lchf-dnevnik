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
            p.edit().putLong("fastStart", now).putLong("pendingFastStart", now).putBoolean("nativeNotify", true).apply()
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
                val elapsed = now - start
                val goalMs = (goal * 3600_000).toLong()
                val done = elapsed >= goalMs
                v.setViewVisibility(R.id.w_clock, View.VISIBLE)
                v.setViewVisibility(R.id.w_fast_off, View.GONE)
                v.setViewVisibility(R.id.w_progress, View.VISIBLE)
                v.setViewVisibility(R.id.w_fast_phase, View.VISIBLE)
                val mins = elapsed / 60_000
                v.setTextViewText(R.id.w_clock, "${mins / 60} h ${String.format(HR, "%02d", mins % 60)} min")
                scheduleTick(context, start)
                v.setProgressBar(R.id.w_progress, 1000, if (goalMs > 0) ((elapsed * 1000) / goalMs).coerceAtMost(1000).toInt() else 0, false)
                v.setTextViewText(
                    R.id.w_fast_info,
                    if (!done) "Početak ${whenTxt(start, today)} · cilj ${whenTxt(start + goalMs, today)}"
                    else "Cilj ostvaren ${whenTxt(start + goalMs, today)} · +${hours(elapsed - goalMs)}"
                )
                v.setTextViewText(R.id.w_fast_phase, PHASES.last { elapsed / 3600_000.0 >= it.first }.second)
                v.setTextViewText(R.id.w_fast_btn, "Završi")
                v.setOnClickPendingIntent(R.id.w_fast_btn, launch(context, "fast_end", 5))
                scheduleGoal(context, start, start + goalMs)
            } else {
                scheduleTick(context, 0L)
                v.setViewVisibility(R.id.w_clock, View.GONE)
                v.setViewVisibility(R.id.w_fast_off, View.VISIBLE)
                v.setViewVisibility(R.id.w_progress, View.GONE)
                v.setViewVisibility(R.id.w_fast_phase, View.GONE)
                v.setTextViewText(R.id.w_fast_info, "Cilj ${Math.round(goal)} h · Započni pokreće post odmah")
                v.setTextViewText(R.id.w_fast_btn, "Započni")
                v.setOnClickPendingIntent(R.id.w_fast_btn, broadcast(context, ACTION_FAST_START, 6))
                scheduleGoal(context, 0L, 0L)
            }

            // Težina
            val weight = p.getFloat("weight", 0f)
            if (weight > 0f) {
                v.setTextViewText(R.id.w_weight, String.format(HR, "%.1f kg", weight))
                val wd = p.getString("weightDate", "") ?: ""
                val parts = mutableListOf<String>()
                parts += if (wd == today) "danas" else wd.split("-").let { if (it.size == 3) "${it[2].toInt()}.${it[1].toInt()}." else "" }
                if (p.contains("rate")) {
                    val r = p.getFloat("rate", 0f)
                    parts += (if (r > 0) "+" else if (r < 0) "−" else "±") + String.format(HR, "%.2f kg/tj", Math.abs(r))
                }
                v.setTextViewText(R.id.w_weight_info, parts.filter { it.isNotEmpty() }.joinToString(" · "))
            } else {
                v.setTextViewText(R.id.w_weight, "– kg")
                v.setTextViewText(R.id.w_weight_info, "još nema mjerenja")
            }

            // Neto UH danas (crveno iznad limita)
            val carbs = if (p.getString("carbDate", "") == today) p.getFloat("carbs", 0f) else 0f
            val limit = p.getFloat("carbLimit", 25f)
            v.setTextViewText(R.id.w_carbs, String.format(HR, "UH %.0f / %.0f g", carbs, limit))
            v.setTextColor(R.id.w_carbs, ContextCompat.getColor(context, if (carbs > limit) R.color.w_bad else R.color.w_muted))

            v.setOnClickPendingIntent(R.id.w_fast, launch(context, "fast", 1))
            v.setOnClickPendingIntent(R.id.w_btn_weight, launch(context, "weight", 2))
            v.setOnClickPendingIntent(R.id.w_btn_food, launch(context, "food", 3))
            return v
        }
    }
}
