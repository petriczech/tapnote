package cz.petriczech.tapnote;

import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import org.json.JSONArray;
import org.json.JSONObject;

// Řádky seznamu widgetu „Můj den“ ze snapshotu v MyDayWidgetStore
public class MyDayWidgetService extends RemoteViewsService {

    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Factory(getApplicationContext());
    }

    private static final class Factory implements RemoteViewsFactory {

        private final Context context;
        private JSONArray tasks = new JSONArray();

        Factory(Context context) {
            this.context = context;
        }

        @Override
        public void onCreate() {}

        @Override
        public void onDataSetChanged() {
            tasks = MyDayWidgetStore.tasks(context);
        }

        @Override
        public void onDestroy() {}

        @Override
        public int getCount() {
            return tasks.length();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            JSONObject task = tasks.optJSONObject(position);
            String id = task == null ? "" : task.optString("id");
            String title = task == null ? "" : task.optString("title");
            RemoteViews row = new RemoteViews(context.getPackageName(), R.layout.widget_my_day_item);
            row.setTextViewText(R.id.widget_item_title, title);
            row.setContentDescription(R.id.widget_item_check, context.getString(R.string.widget_done, title));
            row.setOnClickFillInIntent(
                R.id.widget_item_check,
                new Intent().putExtra(WidgetActionActivity.EXTRA_ID, id).putExtra(WidgetActionActivity.EXTRA_DONE, true)
            );
            row.setOnClickFillInIntent(R.id.widget_item_title, new Intent().putExtra(WidgetActionActivity.EXTRA_ID, id));
            return row;
        }

        @Override
        public RemoteViews getLoadingView() {
            return null;
        }

        @Override
        public int getViewTypeCount() {
            return 1;
        }

        @Override
        public long getItemId(int position) {
            return position;
        }

        @Override
        public boolean hasStableIds() {
            return false;
        }
    }
}
