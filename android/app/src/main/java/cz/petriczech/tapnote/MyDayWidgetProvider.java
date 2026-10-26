package cz.petriczech.tapnote;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

// Widget „Můj den“: záhlaví otevře úkoly, „+“ nový úkol, řádky plní MyDayWidgetService
public class MyDayWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        for (int widgetId : widgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_my_day);
            views.setOnClickPendingIntent(R.id.widget_header, open(context, "tapnote://tasks", 0));
            views.setOnClickPendingIntent(R.id.widget_add, open(context, "tapnote://new-task", 1));

            Intent service = new Intent(context, MyDayWidgetService.class).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
            // Jedinečná data, aby systém nesdílel adaptér mezi instancemi widgetu
            service.setData(Uri.parse(service.toUri(Intent.URI_INTENT_SCHEME)));
            views.setRemoteAdapter(R.id.widget_list, service);
            views.setEmptyView(R.id.widget_list, R.id.widget_empty);

            // Šablona řádků: odškrtnutí i otevření detailu řeší WidgetActionActivity podle doplněných dat
            Intent action = new Intent(context, WidgetActionActivity.class);
            views.setPendingIntentTemplate(
                R.id.widget_list,
                PendingIntent.getActivity(context, 2, action, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE)
            );
            manager.updateAppWidget(widgetId, views);
        }
        // Obnoví seznam a naplánuje půlnoční alarm i po restartu (APPWIDGET_UPDATE znovu nevyvolá)
        MyDayWidgetStore.refresh(context);
    }

    // Půlnoc a změna času nebo pásma: přepočítá se, zda snapshot patří k dnešku
    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent.getAction();
        if (
            MyDayWidgetStore.ACTION_MIDNIGHT.equals(action) ||
            Intent.ACTION_TIME_CHANGED.equals(action) ||
            Intent.ACTION_TIMEZONE_CHANGED.equals(action)
        ) {
            MyDayWidgetStore.refresh(context);
        }
    }

    private static PendingIntent open(Context context, String url, int requestCode) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url), context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
