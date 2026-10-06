package hr.lchf.dnevnik

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Widget za početni zaslon: aktivni post (timer), težina, UH danas i brzi unos. */
class PorkiWidget : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { manager.updateAppWidget(it, build(context)) }
    }

    companion object {
        const val PREFS = "porki_widget"
        private val HR = Locale("hr", "HR")

        fun refreshAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, PorkiWidget::class.java))
            if (ids.isNotEmpty()) ids.forEach { manager.updateAppWidget(it, build(context)) }
        }

        private fun launch(context: Context, action: String, code: Int): PendingIntent {
            val intent = Intent(context, MainActivity::class.java)
                .setAction("hr.lchf.dnevnik.WIDGET_$action")
                .putExtra("widget_action", action)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            return PendingIntent.getActivity(context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }

        private fun goalLabel(goal: Double): String {
            val g = Math.round(goal).toInt()
            return if (g >= 24 || g <= 0) "$g h" else "$g:${24 - g}"
        }

        private fun hours(ms: Long): String {
            val m = ms / 60000
            return "${m / 60} h ${String.format(HR, "%02d", m % 60)} min"
        }

        fun build(context: Context): RemoteViews {
            val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val v = RemoteViews(context.packageName, R.layout.widget_porki)
            val now = System.currentTimeMillis()
            val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(now))
            val time = SimpleDateFormat("HH:mm", HR)

            // Post
            val start = p.getLong("fastStart", 0L)
            val goal = p.getFloat("fastGoal", 16f).toDouble()
            v.setTextViewText(R.id.w_fast_label, "Post ${goalLabel(goal)}")
            if (start > 0 && start <= now) {
                val elapsed = now - start
                val goalMs = (goal * 3600_000).toLong()
                v.setViewVisibility(R.id.w_clock, View.VISIBLE)
                v.setViewVisibility(R.id.w_fast_off, View.GONE)
                v.setViewVisibility(R.id.w_progress, View.VISIBLE)
                v.setChronometer(R.id.w_clock, SystemClock.elapsedRealtime() - elapsed, null, true)
                v.setProgressBar(R.id.w_progress, 1000, if (goalMs > 0) ((elapsed * 1000) / goalMs).coerceAtMost(1000).toInt() else 0, false)
                v.setTextViewText(
                    R.id.w_fast_info,
                    if (elapsed < goalMs) "Početak ${time.format(Date(start))} · cilj u ${time.format(Date(start + goalMs))}"
                    else "Cilj ostvaren u ${time.format(Date(start + goalMs))} · +${hours(elapsed - goalMs)}"
                )
            } else {
                v.setChronometer(R.id.w_clock, SystemClock.elapsedRealtime(), null, false)
                v.setViewVisibility(R.id.w_clock, View.GONE)
                v.setViewVisibility(R.id.w_fast_off, View.VISIBLE)
                v.setViewVisibility(R.id.w_progress, View.GONE)
                v.setTextViewText(R.id.w_fast_info, "Dodirni za početak posta")
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

            // Neto UH danas
            val carbs = if (p.getString("carbDate", "") == today) p.getFloat("carbs", 0f) else 0f
            val limit = p.getFloat("carbLimit", 25f)
            v.setTextViewText(R.id.w_carbs, String.format(HR, "UH %.0f / %.0f g", carbs, limit))

            v.setOnClickPendingIntent(R.id.w_fast, launch(context, "fast", 1))
            v.setOnClickPendingIntent(R.id.w_btn_weight, launch(context, "weight", 2))
            v.setOnClickPendingIntent(R.id.w_btn_food, launch(context, "food", 3))
            return v
        }
    }
}
