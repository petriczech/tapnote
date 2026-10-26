package cz.petriczech.tapnote;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

// Snapshot úkolů Můj den a fronta odškrtnutí v SharedPreferences, sdílené widgetem a pluginem WidgetBridge
final class MyDayWidgetStore {

    private static final String PREFS = "my_day_widget";
    private static final String TASKS = "tasks";
    private static final String TOGGLES = "toggles";
    private static final String DATE = "date";
    static final String ACTION_MIDNIGHT = "cz.petriczech.tapnote.MY_DAY_MIDNIGHT";

    private MyDayWidgetStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // Snapshot z jiného dne se nezobrazí (Můj den se o půlnoci mění bez změny úkolů)
    static synchronized JSONArray tasks(Context context) {
        if (!today().equals(prefs(context).getString(DATE, ""))) {
            return new JSONArray();
        }
        return parse(prefs(context).getString(TASKS, "[]"));
    }

    // Úkoly odškrtnuté ve widgetu, které aplikace ještě nepřevzala, se do snapshotu nevracejí
    static synchronized void saveTasks(Context context, JSONArray tasks, String date) {
        java.util.Set<String> pending = new java.util.HashSet<>();
        JSONArray toggles = parse(prefs(context).getString(TOGGLES, "[]"));
        for (int i = 0; i < toggles.length(); i++) {
            JSONObject toggle = toggles.optJSONObject(i);
            if (toggle != null && toggle.optBoolean("done")) {
                pending.add(toggle.optString("id"));
            }
        }
        JSONArray rest = new JSONArray();
        for (int i = 0; i < tasks.length(); i++) {
            JSONObject task = tasks.optJSONObject(i);
            if (task != null && !pending.contains(task.optString("id"))) {
                rest.put(task);
            }
        }
        prefs(context).edit().putString(TASKS, rest.toString()).putString(DATE, date).apply();
        refresh(context);
    }

    // Úkol zmizí ze seznamu hned a odškrtnutí počká ve frontě, než si ho aplikace převezme
    static synchronized void markDone(Context context, String id) {
        JSONArray tasks = tasks(context);
        JSONArray rest = new JSONArray();
        for (int i = 0; i < tasks.length(); i++) {
            JSONObject task = tasks.optJSONObject(i);
            if (task != null && !id.equals(task.optString("id"))) {
                rest.put(task);
            }
        }
        JSONArray toggles = parse(prefs(context).getString(TOGGLES, "[]"));
        try {
            toggles.put(new JSONObject().put("id", id).put("done", true).put("at", isoNow()));
        } catch (JSONException ignored) {
            // Klíče jsou pevné, výjimka nenastane
        }
        prefs(context).edit().putString(TASKS, rest.toString()).putString(TOGGLES, toggles.toString()).apply();
        refresh(context);
    }

    static synchronized JSONArray takeToggles(Context context) {
        JSONArray toggles = parse(prefs(context).getString(TOGGLES, "[]"));
        prefs(context).edit().remove(TOGGLES).apply();
        return toggles;
    }

    static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, MyDayWidgetProvider.class));
        manager.notifyAppWidgetViewDataChanged(ids, R.id.widget_list);
        scheduleMidnight(context);
    }

    // Obnovení po místní půlnoci; nepřesný alarm nepotřebuje oprávnění k přesným alarmům
    private static void scheduleMidnight(Context context) {
        java.util.Calendar midnight = java.util.Calendar.getInstance();
        midnight.add(java.util.Calendar.DAY_OF_YEAR, 1);
        midnight.set(java.util.Calendar.HOUR_OF_DAY, 0);
        midnight.set(java.util.Calendar.MINUTE, 0);
        midnight.set(java.util.Calendar.SECOND, 1);
        midnight.set(java.util.Calendar.MILLISECOND, 0);
        android.content.Intent intent = new android.content.Intent(context, MyDayWidgetProvider.class).setAction(ACTION_MIDNIGHT);
        android.app.PendingIntent pending = android.app.PendingIntent.getBroadcast(
            context,
            0,
            intent,
            android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_IMMUTABLE
        );
        android.app.AlarmManager alarms = (android.app.AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        alarms.set(android.app.AlarmManager.RTC, midnight.getTimeInMillis(), pending);
    }

    // Místní datum RRRR-MM-DD jako localDate() v aplikaci
    private static String today() {
        return new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.ROOT).format(new java.util.Date());
    }

    // ISO 8601 v UTC i pro minSdk 24 (java.time až od API 26)
    private static String isoNow() {
        java.text.SimpleDateFormat format = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.ROOT);
        format.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
        return format.format(new java.util.Date());
    }

    private static JSONArray parse(String json) {
        try {
            return new JSONArray(json);
        } catch (JSONException e) {
            return new JSONArray();
        }
    }
}
