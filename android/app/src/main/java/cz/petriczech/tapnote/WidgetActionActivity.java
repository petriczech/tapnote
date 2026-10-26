package cz.petriczech.tapnote;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

// Neviditelný mezikrok pro klepnutí na řádek widgetu: odškrtnutí proběhne bez otevření aplikace,
// klepnutí na název otevře detail úkolu (z broadcastu by Android aktivitu na pozadí spustit nemusel)
public class WidgetActionActivity extends Activity {

    static final String EXTRA_ID = "id";
    static final String EXTRA_DONE = "done";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String id = getIntent().getStringExtra(EXTRA_ID);
        if (id != null) {
            if (getIntent().getBooleanExtra(EXTRA_DONE, false)) {
                MyDayWidgetStore.markDone(this, id);
            } else {
                startActivity(
                    new Intent(Intent.ACTION_VIEW, Uri.parse("tapnote://task/" + id), this, MainActivity.class).addFlags(
                        Intent.FLAG_ACTIVITY_NEW_TASK
                    )
                );
            }
        }
        finish();
    }
}
